// Turns the stage web page plus our audio mixer into a video stream.
// The stage page is drawn by Chromium, and ffmpeg gets its picture in one of two ways:
//   * pipe mode (default, used on a Mac): headless Chromium's screencast frames are sent to ffmpeg as JPEGs, repeated at a steady 30 fps.
//   * screen mode (HUBIE_X11_DISPLAY=:98, used on the Linux server): Chromium runs full screen on its own virtual screen and ffmpeg reads
//     that screen directly (x11grab). There is no JPEG step, which is what limited fast animations to about 17 frames per second.
// The same code runs on a Mac (hardware encoder) or on the Linux server (x264).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { Mixer } from './audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startStreamer({ url, outFile = '', rtmp = '', recordPattern = '', width = 1280, height = 720, fps = 30, bitrate = process.env.HUBIE_BITRATE || '5500k', scale = Number(process.env.HUBIE_SCALE || 1.5), log = () => {} }) {
  const linux = process.platform === 'linux';   // a server without a graphics card: Mesa's software EGL is several times faster than the default there
  const x11 = linux ? (process.env.HUBIE_X11_DISPLAY || '') : '';
  const w = Math.round(width * scale), h = Math.round(height * scale);
  // Live (Kick) uses strict CBR x264 with no B-frames and a keyframe exactly every 2 s, which ingest servers like best.
  // File-only test runs on a Mac use the hardware encoder, which is lighter.
  const hw = process.platform === 'darwin' && !rtmp && !process.env.HUBIE_FORCE_X264;
  const gop = String(fps * 2);
  const venc = hw
    ? ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-realtime', '1', '-profile:v', 'main', '-g', gop, '-allow_sw', '1']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-b:v', bitrate, '-minrate', bitrate, '-maxrate', bitrate, '-bufsize', bitrate,
       '-x264-params', `nal-hrd=cbr:keyint=${gop}:min-keyint=${gop}:scenecut=0:bframes=0`, '-g', gop, '-keyint_min', gop, '-sc_threshold', '0'];
  const videoDelay = String(Number(process.env.VIDEO_DELAY_MS || 300) / 1000);
  const videoIn = x11
    // the finished screen, read at a steady rate; the mixer is started right after ffmpeg so audio and picture share a start
    ? ['-itsoffset', videoDelay, '-f', 'x11grab', '-draw_mouse', '0', '-framerate', String(fps), '-video_size', `${w}x${h}`, '-i', `${x11}.0`]
    // video frames are stamped by the wall clock they arrive on
    : ['-use_wallclock_as_timestamps', '1', '-itsoffset', videoDelay, '-thread_queue_size', '512', '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', 'pipe:0'];
  const args = ['-hide_banner', '-loglevel', process.env.HUBIE_FFMPEG_LOGLEVEL || 'warning', '-nostats',
    ...videoIn,
    // audio keeps its natural sample timing (the mixer produces exactly 48000 samples a second and starts together with the video)
    '-thread_queue_size', '2048', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:3',
    '-vf', `fps=${fps},format=yuv420p`, ...venc,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000'];
  if (rtmp) {
    const outs = [`[f=flv]${rtmp}`];
    if (recordPattern) outs.push(`[f=segment:segment_time=1800:reset_timestamps=1:segment_format=mp4:segment_format_options=movflags=+frag_keyframe+empty_moov]${recordPattern}`);
    args.push('-map', '0:v', '-map', '1:a', '-f', 'tee', outs.join('|'));
  } else {
    args.push('-map', '0:v', '-map', '1:a', '-movflags', '+faststart', '-y', outFile);
  }

  const state = { alive: true, frames: 0, dropped: 0, startedAt: Date.now(), lastFrameAt: Date.now() };
  let ff = null;
  const spawnFF = () => {
    ff = spawn('ffmpeg', args, { stdio: [x11 ? 'ignore' : 'pipe', 'inherit', 'inherit', 'pipe'] });
    ff.on('exit', (c, s) => { state.alive = false; log(`ffmpeg exited code=${c} signal=${s}`); });
    ff.stdin?.on('error', () => {}); ff.stdio[3].on('error', () => {});
  };
  if (!x11) spawnFF();                       // pipe mode: ffmpeg waits for the first frame; screen mode starts it once the page is ready
  const mixer = new Mixer((buf) => { if (state.alive && ff) ff.stdio[3].write(buf); });
  let mixerStarted = false;

  const linuxArgs = linux ? ['--use-gl=egl', '--ignore-gpu-blocklist'] : [];
  const commonArgs = ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--force-device-scale-factor=${scale}`];
  const launchEnv = { ...process.env, ...(linux ? { LP_NUM_THREADS: String(process.env.STAGE_LP_THREADS || 3), LIBGL_ALWAYS_SOFTWARE: '1' } : {}), ...(x11 ? { DISPLAY: x11 } : {}) };
  const browser = x11
    ? await chromium.launch({ headless: false, env: launchEnv, ignoreDefaultArgs: ['--enable-automation'],
        args: [...linuxArgs, ...commonArgs, '--kiosk', '--window-position=0,0', `--window-size=${width},${height}`, '--hide-scrollbars', '--noerrdialogs', '--disable-infobars', '--disable-translate', '--no-first-run', '--password-store=basic'] })
    : await chromium.launch({ env: launchEnv, args: [...linuxArgs, ...commonArgs] });
  const ctx = await browser.newContext(x11 ? { viewport: null } : { viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log('page error: ' + m.text()); });
  page.on('pageerror', (e) => log('page exception: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });

  let cdp = null, statsTimer = null, heartbeat = null;
  if (x11) {
    // screen mode: give the page a moment to paint its first frame, then start the encoder and the audio together
    await sleep(1500);
    spawnFF(); mixerStarted = true; mixer.start();
    log(`stage is captured straight from the virtual screen ${x11} (${w}x${h}), no JPEG step`);
    heartbeat = setInterval(() => { if (state.alive) { state.lastFrameAt = Date.now(); state.frames += fps; } }, 1000);   // the encoder reads the screen itself; ffmpeg exiting is what signals trouble
  } else {
    cdp = await ctx.newCDPSession(page);
    // Frames arrive from the page when it paints, unevenly (fast animations paint in bursts). The encoder gets them at a steady rhythm instead:
    // the newest frame is sent every 1/fps second, and repeated when nothing newer has arrived. That is what keeps fast games from looking jittery.
    let busy = false, latest = null, pacerOn = false, arrived = 0, written = 0, repeated = 0, skipped = 0;
    const interval = 1000 / fps;
    const pace = () => {
      let next = Date.now();
      const tick = () => {
        if (!state.alive) return;
        next += interval; const now = Date.now(); if (next < now - interval * 3) next = now;     // never try to catch up a long stall with a burst
        if (latest) {
          if (busy) skipped++;
          else {
            const fresh = latest.fresh; latest.fresh = false; if (!fresh) repeated++;
            written++; state.frames++;
            if (!ff.stdin.write(latest.buf)) { busy = true; ff.stdin.once('drain', () => { busy = false; }); }
          }
        }
        setTimeout(tick, Math.max(0, next - Date.now()));
      };
      tick();
    };
    cdp.on('Page.screencastFrame', (f) => {
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      if (!state.alive) return;
      arrived++; state.lastFrameAt = Date.now();
      latest = { buf: Buffer.from(f.data, 'base64'), fresh: true };
      if (!pacerOn) { pacerOn = true; mixerStarted = true; mixer.start(); pace(); }
    });
    statsTimer = setInterval(() => {
      if (!state.alive) return;
      log(`video: ${(arrived / 30).toFixed(1)} new frames/s from the page, ${(written / 30).toFixed(1)}/s sent (${(repeated / 30).toFixed(1)}/s repeats), ${skipped} skipped by the encoder in 30 s`);
      state.dropped += skipped; arrived = written = repeated = skipped = 0;
    }, 30000);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: Number(process.env.STAGE_JPEG_Q || 82), maxWidth: w, maxHeight: h, everyNthFrame: 1 });
  }

  async function stop() {
    clearInterval(statsTimer); clearInterval(heartbeat);
    mixer.stop();
    try { await cdp?.send('Page.stopScreencast'); } catch {}
    try { await browser.close(); } catch {}
    try { ff?.stdin?.end(); ff?.stdio[3].end(); } catch {}
    if (x11 && ff && state.alive) { try { ff.kill('SIGINT'); } catch {} }   // screen mode has no input pipe to close: SIGINT makes ffmpeg finish its file properly
    await new Promise((r) => { if (!state.alive || !ff) return r(); ff.on('exit', r); setTimeout(() => { try { ff.kill('SIGTERM'); } catch {} r(); }, 8000); });
  }
  return { mixer, page, state, stop, get ffmpeg() { return ff; } };
}
