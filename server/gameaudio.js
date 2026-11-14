// Captures the sound the game page plays, so it can be mixed into the stream under Hubie's voice.
// A small script runs inside the page before the game starts. It taps every Web Audio output (and every <audio>/<video>
// element) and hands raw samples to Node through a CDP binding. Nothing about the game changes: it still plays as usual.
export const HOOK_SOURCE = `(() => {
  if (window.__hubieTap) return;
  const T = window.__hubieTap = { chunks: 0, ctxs: 0, media: 0, peak: 0 };
  const send = (rate, L, R) => {
    const n = L.length, b = new Int16Array(n * 2); let pk = 0;
    for (let i = 0; i < n; i++) {
      const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
      b[i * 2] = l * 32767; b[i * 2 + 1] = r * 32767; pk = Math.max(pk, Math.abs(l), Math.abs(r));
    }
    T.chunks++; T.peak = Math.max(T.peak, pk);
    let s = ''; const u = new Uint8Array(b.buffer);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    try { window.__hubieAudio(rate + ':' + btoa(s)); } catch {}
  };
  const origConnect = AudioNode.prototype.connect;
  const tapFor = (ctx) => {
    if (ctx.__hubieTapNode) return ctx.__hubieTapNode;
    T.ctxs++;
    const sp = ctx.createScriptProcessor(2048, 2, 2), mute = ctx.createGain(); mute.gain.value = 0;
    sp.__hubieInternal = mute.__hubieInternal = true;
    sp.onaudioprocess = (e) => {
      const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : L;
      send(ctx.sampleRate, L, R);
    };
    origConnect.call(sp, mute); origConnect.call(mute, ctx.destination);
    ctx.__hubieTapNode = sp; return sp;
  };
  AudioNode.prototype.connect = function (dest, ...a) {
    const r = origConnect.call(this, dest, ...a);
    try { if (dest instanceof AudioDestinationNode && !this.__hubieInternal) origConnect.call(this, tapFor(this.context)); } catch {}
    return r;
  };
  // <audio>/<video> elements play outside Web Audio; route them through it (and on to the speakers) so they can be tapped
  const mediaCtx = () => (window.__hubieMediaCtx ||= new (window.AudioContext || window.webkitAudioContext)());
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    try {
      if (!this.__hubieRouted && !this.muted) {
        this.__hubieRouted = true; T.media++;
        const ctx = mediaCtx(); const src = ctx.createMediaElementSource(this); src.connect(ctx.destination); ctx.resume().catch(() => {});
      }
    } catch {}
    return origPlay.apply(this, a);
  };
})();`;

// attach(page): installs the hook for every new document and the page that is already open.
// onPCM(Int16Array interleaved stereo, sampleRate) is called for every chunk.
export async function attachGameAudio(page, onPCM, { log = () => {} } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Runtime.addBinding', { name: '__hubieAudio' });
  cdp.on('Runtime.bindingCalled', (e) => {
    if (e.name !== '__hubieAudio') return;
    const i = e.payload.indexOf(':'); const rate = Number(e.payload.slice(0, i));
    const buf = Buffer.from(e.payload.slice(i + 1), 'base64');
    onPCM(new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1), rate);
  });
  await page.addInitScript(HOOK_SOURCE);                 // runs in every document the page loads from now on
  await page.evaluate(HOOK_SOURCE).catch(() => {});       // and in the one that is already open
  log('game audio capture installed');
  return {
    stats: () => page.evaluate(() => window.__hubieTap || null).catch(() => null),
    detach: async () => { try { await cdp.detach(); } catch {} },
  };
}
