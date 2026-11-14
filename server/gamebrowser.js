// Attaches to the dedicated game Chrome (started by tools/launch_game_browser.sh) over its local debugging port.
// It only observes the page and sends normal input events. It never tries to pass or solve a site check:
// if a verification page shows up it reports "challenge" and waits.
import { chromium } from 'playwright';

export function createGameBrowser({ port = 9222, log = () => {} } = {}) {
  let browser = null, page = null, cdp = null, feeding = false;
  const state = { connected: false, challenge: false, url: '', frames: 0 };

  async function connect() {
    if (browser) { try { if (browser.isConnected()) return; } catch {} }
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    state.connected = true;
    browser.on('disconnected', () => { state.connected = false; page = null; cdp = null; viewCdp = null; viewPage = null; feeding = false; log('game browser disconnected'); });
  }
  async function getPage() {
    await connect();
    const pages = browser.contexts().flatMap((c) => c.pages());
    page = pages.find((p) => /housebets\.com/.test(p.url())) || pages[0] || null;
    if (!page) throw new Error('no page open in the game browser');
    return page;
  }
  async function checkChallenge() {
    const p = page || await getPage();
    let title = ''; let body = '';
    try { title = await p.title(); body = (await p.locator('body').innerText({ timeout: 2000 })).slice(0, 400); } catch {}
    state.url = p.url();
    state.challenge = /just a moment|attention required|security verification/i.test(title + ' ' + body);
    return state.challenge;
  }
  // stream JPEG frames of the game page; onFrame(Buffer)
  // The page keeps a 1280x720 layout (so every click position stays the same) but is drawn at a higher pixel density, so the
  // picture that reaches the stream is sharp instead of an upscaled 720p image.
  const VIEW = { width: 1280, height: 720, scale: Number(process.env.HUBIE_SCALE || 1.5) };
  let viewCdp = null, viewPage = null;
  // scale: the page's pixel density. The heaviest animations (the roulette wheel) are drawn at a lighter density so a server without a graphics
  // card keeps up; the stage scales the picture up to the stream's size.
  async function applyView(p, scale) {
    p = p || page || await getPage();
    if (scale) VIEW.current = scale;
    if (!viewCdp || viewPage !== p) { viewCdp = await p.context().newCDPSession(p); viewPage = p; }
    await viewCdp.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.current || VIEW.scale, mobile: false });
  }
  async function startFeed(onFrame, { quality = Number(process.env.GAME_JPEG_Q || 85) } = {}) {
    const p = page || await getPage();
    await applyView(p);
    cdp = await p.context().newCDPSession(p);
    cdp.on('Page.screencastFrame', (f) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); state.frames++; onFrame(Buffer.from(f.data, 'base64')); });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: Math.round(VIEW.width * VIEW.scale), maxHeight: Math.round(VIEW.height * VIEW.scale), everyNthFrame: Number(process.env.GAME_FEED_EVERY || 2) });
    feeding = true;
  }
  async function stopFeed() { try { await cdp?.send('Page.stopScreencast'); } catch {} feeding = false; }
  return { connect, getPage, checkChallenge, startFeed, stopFeed, applyView, state, get page() { return page; } };
}
