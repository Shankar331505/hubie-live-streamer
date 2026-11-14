// Plays the real House Games on housebets.com in the dedicated game Chrome (already signed in by a human).
// Rules this driver enforces:
//   * ZERO-STAKE ONLY: it refuses to click anything unless the account balance is exactly zero.
//   * It never touches Wallet, Real Play, deposits or any money control: it only clicks Bet and each game's own controls.
//   * If a verification page or a login screen appears it stops and reports it. It never tries to solve or bypass one.
//   * Results are read from the page's own network responses.
import { EXTRA_SPECS } from './housebets_games2.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;

export const BALANCE_SEL = '[data-testid=header-balance-box]';
const base = 'https://www.housebets.com/games/housegames-';
const pickOne = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// per-game specs. Coordinates are for a 1280x720 viewport.
//   vary(ctx): optional small change a player might make before betting (target, risk, side...)
//   parse(json) -> { win, multiplier, big, detail, summary }
const RISK_XY = { wheel: { low: [194, 340], medium: [284, 340], high: [396, 340] }, plinko: { low: [194, 316], medium: [294, 316], high: [394, 316] } };
const RISK_OPTS = [{ id: 'low', label: 'low risk', words: ['low', 'safe', 'safest', 'small', 'careful', 'chill'] }, { id: 'medium', label: 'medium risk', words: ['medium', 'mid', 'middle', 'normal'] }, { id: 'high', label: 'high risk', words: ['high', 'risky', 'big', 'danger', 'yolo', 'max', 'crazy'] }];
const askRisk = (game, what) => async (c) => { const a = await c.consult({ game, situation: `Hubie is about to ${what}.`, question: 'should we go low, medium or high risk', optionsText: '"low", "medium" or "high"', options: RISK_OPTS }); if (a) { c.st.pick = a.choice; c.st.pickBy = a.by; } };
const CORE_SPECS = {
  dice: {
    url: base + 'dice', api: /games\.housebets\.com\/dice\/bet/, bet: { x: 285, y: 312 }, settle: [1700, 2300],
    async vary({ p, st, humanMove, rand }) {
      if (rand() > 0.55) return;
      const t = r2(18 + rand() * 72), xOf = (v) => 503 + (1190 - 503) * v / 100;
      await humanMove(p, { x: xOf(st.target), y: 393 });
      await p.mouse.down(); await sleep(60);
      await p.mouse.move(xOf((st.target + t) / 2), 393, { steps: 8 }); await p.mouse.move(xOf(t), 393, { steps: 8 });
      await sleep(60); await p.mouse.up(); await sleep(250 + rand() * 300); st.target = t;
    },
    parse(j) {
      const g = j.game || {}, out = Number(g.outcome), t = Number(g.rollOver), mode = g.mode || g.betDirection || 'over';
      let win; if (mode === 'under') win = out < t; else if (mode === 'inside') win = out >= g.rangeLo && out <= g.rangeHi; else if (mode === 'outside') win = !(out >= g.rangeLo && out <= g.rangeHi); else win = out > t;
      const mult = Number(g.payoutMultiplier) || (g.winChance ? r2(99 / Number(g.winChance)) : 0);
      return { win, multiplier: win ? mult : 0, big: win && mult >= 10, detail: { roll: out, target: t, mode, winChance: g.winChance },
        summary: `${win ? 'a win' : 'a miss'}: the roll was ${out}, the target was ${mode} ${t}, a ${g.winChance}% chance at ${mult}x` };
    },
  },
  limbo: {
    url: base + 'limbo', api: /games\.housebets\.com\/limbo\/bet/, bet: { x: 286, y: 452 }, settle: [2200, 3000],
    async vary({ p, humanMove, rand }) {
      if (rand() > 0.6) return;
      const b = pickOne([[162, 396], [224, 396], [224, 396], [286, 396], [346, 396]], rand);   // 1.5x 2x 5x 10x quick targets
      await humanMove(p, { x: b[0], y: b[1] }); await p.mouse.click(b[0], b[1]); await sleep(300);
    },
    parse(j) {
      const g = j.game || {}, target = Number(g.betNumber), out = Number(g.outcome), win = out >= target;
      return { win, multiplier: win ? target : 0, big: win && target >= 10, detail: { target, outcome: out, winChance: g.winChance },
        summary: `${win ? 'a win' : 'a miss'}: the target was ${target}x and the game drew ${out}x, a ${g.winChance}% chance` };
    },
  },
  wheel: {
    scale: Number(process.env.HUBIE_HEAVY_SCALE || 1),
    pre: askRisk('Wheel', 'spin the wheel'),
    url: base + 'wheel', api: /games\.housebets\.com\/wheel2\/bet/, bet: { x: 284, y: 492 }, settle: [4300, 5200],
    async vary({ p, st, humanMove, rand }) {
      if (!st.pick && rand() > 0.5) return;
      const b = st.pick ? RISK_XY.wheel[st.pick] : pickOne([[194, 340], [284, 340], [396, 340]], rand);   // low / medium / high risk
      await humanMove(p, { x: b[0], y: b[1] }); await p.mouse.click(b[0], b[1]); await sleep(300);
    },
    parse(j) {
      const g = j.game || {}, m = Number(g.multiplier) || 0, win = m >= 1;
      return { win, multiplier: win ? m : 0, big: win && m >= 10, detail: { risk: g.risk, segments: g.segments, segment: g.segment, multiplier: m },
        summary: `${win ? 'a win' : m > 0 ? 'a small payout' : 'a bust'}: the wheel (${g.risk} risk, ${g.segments} segments) stopped on a ${m}x segment` };
    },
  },
  plinko: {
    scale: Number(process.env.HUBIE_HEAVY_SCALE || 1),
    pre: askRisk('Plinko', 'drop the ball'),
    url: base + 'plinko', api: /games\.housebets\.com\/plinko2\/bet/, bet: { x: 284, y: 462 }, settle: [3800, 5000],
    async vary({ p, st, humanMove, rand }) {
      if (!st.pick && rand() > 0.5) return;
      const b = st.pick ? RISK_XY.plinko[st.pick] : pickOne([[194, 316], [294, 316], [394, 316]], rand);   // low / medium / high risk
      await humanMove(p, { x: b[0], y: b[1] }); await p.mouse.click(b[0], b[1]); await sleep(300);
    },
    parse(j) {
      const g = j.game || {}, m = Number(g.multiplier) || 0, win = m >= 1;
      return { win, multiplier: win ? m : 0, big: win && m >= 10, detail: { risk: g.risk, rows: g.rows, bucket: g.bucket, multiplier: m },
        summary: `${win ? 'a win' : 'a miss'}: the ball (${g.risk} risk, ${g.rows} rows) landed in a ${m}x bucket` };
    },
  },
  'coin-flip': {
    pre: async (c) => { const a = await c.consult({ game: 'Coin Flip', situation: 'Hubie is about to flip the coin that has his own face on it.', question: 'heads or tails', optionsText: '"heads" or "tails"', options: [{ id: 'heads', label: 'heads', words: ['heads', 'head'] }, { id: 'tails', label: 'tails', words: ['tails', 'tail'] }] }); if (a) { c.st.pick = a.choice; c.st.pickBy = a.by; } },
    url: base + 'coin-flip', api: /games\.housebets\.com\/coinflip\/bet/, bet: { x: 286, y: 536 }, settle: [2400, 3200],
    async vary({ p, st, humanMove, rand }) {
      const b = st.pick === 'heads' ? [222, 334] : st.pick === 'tails' ? [364, 334] : rand() < 0.5 ? [222, 334] : [364, 334];   // heads or tails
      await humanMove(p, { x: b[0], y: b[1] }); await p.mouse.click(b[0], b[1]); await sleep(300);
    },
    parse(j) {
      const g = j.game || {}, win = Number(g.matched) >= Number(g.target || 1), mult = r2(Number(g.payoutMultiplier) || 1.98);
      return { win, multiplier: win ? mult : 0, big: false, detail: { calls: g.calls, flips: g.flips },
        summary: `${win ? 'a win' : 'a miss'}: called ${g.calls === 'H' ? 'heads' : 'tails'} and the coin landed ${g.flips === 'H' ? 'heads' : 'tails'}` };
    },
  },
  'max-win': {
    scale: Number(process.env.HUBIE_HEAVY_SCALE || 1),
    url: base + 'max-win', api: /games\.housebets\.com\/maxwin\/bet/, bet: { x: 286, y: 404 }, settle: [3800, 4800],
    async vary() {},
    parse(j) {
      const g = j.game || {}, target = Number(g.betNumber), out = Number(g.outcome), win = out >= target;
      return { win, multiplier: win ? target : 0, big: win, detail: { target, outcome: out, winChance: g.winChance },
        summary: win ? `a jackpot: the target was ${target}x and the slot drew ${out}x, against a ${g.winChance}% chance` : `a miss: the slot needed ${target}x for the jackpot and drew ${out}x, a ${g.winChance}% chance` };
    },
  },
};
export const SPECS = { ...CORE_SPECS, ...EXTRA_SPECS };

export function createHousebetsDriver({ gb, send, log = () => {}, rand = Math.random, consult = null }) {
  const st = { target: 50.5, mouse: { x: 640, y: 360 }, fails: 0, status: 'idle', last: null };

  async function humanMove(p, to, { settle = true } = {}) {
    const from = st.mouse;
    const mid = { x: (from.x + to.x) / 2 + (rand() - 0.5) * 80, y: (from.y + to.y) / 2 + (rand() - 0.5) * 60 };
    send({ t: 'cursor', x: mid.x, y: mid.y });
    await p.mouse.move(mid.x, mid.y, { steps: 10 + Math.floor(rand() * 8) });
    await sleep(60 + rand() * 120);
    send({ t: 'cursor', x: to.x, y: to.y });
    await p.mouse.move(to.x + (rand() - 0.5) * 6, to.y + (rand() - 0.5) * 4, { steps: 7 + Math.floor(rand() * 6) });
    if (settle) await sleep(90 + rand() * 160);
    st.mouse = { x: to.x, y: to.y };
  }

  async function guard(p) {
    if (await gb.checkChallenge()) { st.status = 'challenge'; throw Object.assign(new Error('site verification page is showing'), { code: 'challenge' }); }
    let bal = null, reloads = 0;
    for (let i = 0; i < 50; i++) {                       // a freshly opened page needs up to ~15 s to finish signing in
      bal = await p.evaluate((sel) => document.querySelector(sel)?.innerText.trim() ?? null, BALANCE_SEL).catch(() => null);
      if (bal && /\d/.test(bal)) break;
      // a page that is still on "Loading..." after 15 s is stuck (the session is fine): reload it, like a person would
      if (i > 0 && i % 15 === 0 && reloads < 2) {
        reloads++; log('page stuck on "' + (bal ?? 'nothing') + '", reloading it (' + reloads + ')');
        await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await sleep(1500);
      }
      await sleep(1000);
    }
    if (!bal || !/\d/.test(bal)) { st.status = 'logged_out'; throw Object.assign(new Error('not signed in, or the page did not finish loading (no balance shown)'), { code: 'logged_out' }); }
    const n = Number(bal.replace(/[^0-9.]/g, ''));
    if (!(n === 0)) { st.status = 'balance_not_zero'; throw Object.assign(new Error(`balance is ${bal}, refusing to play (zero-stake only)`), { code: 'balance' }); }
    return bal;
  }

  // the library browse leaves the page scrolled a little; the game page must sit at the top or every click lands off its button
  async function toTop(p) {
    await p.evaluate(() => { window.scrollTo(0, 0); document.scrollingElement && (document.scrollingElement.scrollTop = 0); for (const e of document.querySelectorAll('main, [class*=scroll]')) if (e.scrollTop) e.scrollTop = 0; }).catch(() => {});
    await sleep(250);
  }

  // center of an element's box, or null if it is not there
  const centerOf = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom } : null; }, sel);
  const wheel = async (p, total, steps = 6) => { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, total / steps); await sleep(60 + rand() * 60); } };

  // Go back to the House Games library the way a person does: click the sidebar link (the URL is only a fallback).
  async function openLibrary(p) {
    const link = await centerOf(p, 'a[href="/house-games"]');
    if (link && !p.url().includes('/house-games')) { await humanMove(p, link); send({ t: 'cursor', x: link.x, y: link.y, click: true }); await p.mouse.click(link.x, link.y); }
    else if (!p.url().includes('/house-games')) await p.goto('https://www.housebets.com/house-games', { waitUntil: 'domcontentloaded' });
    // wait for the library itself (the address and a full grid of tiles), not just any game link on the page
    await p.waitForURL((u) => u.toString().includes('/house-games'), { timeout: 20000 });
    await p.waitForFunction(() => document.querySelectorAll('a[href*="/games/housegames-"]').length >= 12, null, { timeout: 25000 });
    await sleep(900 + rand() * 500);
  }

  // The header can show the balance while the game's own panel is still signing in (it shows a "Log in" button and a loading bar).
  // Wait until that button is gone; if it never goes, reload the page once, as a person would.
  async function gameReady(p) {
    const loggedOutBtn = () => p.evaluate(() => [...document.querySelectorAll('button')].some((b) => { const r = b.getBoundingClientRect(); return r.width && r.left > 100 && /^log in$/i.test((b.innerText || '').trim()); })).catch(() => false);
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 25; i++) { if (!(await loggedOutBtn())) { await sleep(600); return; } await sleep(1000); }
      if (round === 0) { log('game panel still signing in, reloading the page'); await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}); await sleep(2500); await guard(p); }
    }
    throw Object.assign(new Error('the game panel never finished signing in'), { code: 'logged_out' });
  }

  // used before going live: the page must be signed in, at zero balance, with no verification page
  async function preflight() {
    const p = await gb.getPage();
    await gb.applyView(p);
    return guard(p);
  }

  // Browse the library so viewers can see what is on offer: sweep over some tiles, scroll a little, then open the chosen game.
  async function browseAndOpen(p, slug) {
    await openLibrary(p);
    await guard(p);
    const tiles = await p.evaluate(() => [...document.querySelectorAll('a[href*="/games/housegames-"]')].map((a) => { const r = a.getBoundingClientRect(); return { slug: a.getAttribute('href').split('housegames-')[1], x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    const target = tiles.find((t) => t.slug === slug); if (!target) throw new Error('game tile not found in the library: ' + slug);
    // glance over a handful of other tiles, row by row, pausing on some
    const others = tiles.filter((t) => t.slug !== slug).sort((a, b) => (Math.round(a.y / 100) - Math.round(b.y / 100)) || (a.x - b.x));
    const picks = others.filter((_, i) => i % 2 === Math.floor(rand() * 2)).slice(0, 4 + Math.floor(rand() * 3));
    for (const t of picks) { await humanMove(p, t); await sleep(450 + rand() * 750); }
    if (rand() < 0.7) { await wheel(p, 260 + rand() * 200); await sleep(600 + rand() * 500); await wheel(p, -420, 7); await sleep(400); }   // a look further down the page, then back up
    await humanMove(p, target); await sleep(500 + rand() * 600);                                                                             // settle on the one we want
    send({ t: 'cursor', x: target.x, y: target.y, click: true });
    const nav = p.waitForURL((u) => u.toString().includes('housegames-' + slug), { timeout: 15000 });
    await p.mouse.click(target.x, target.y);
    await nav; await sleep(3200);                                                                                                            // let the game load
  }

  async function switchGame(game) {
    const spec = SPECS[game.id]; if (!spec) throw new Error('no driver for ' + game.id);
    const p = await gb.getPage();
    await gb.applyView(p);
    try { await browseAndOpen(p, game.id); }
    catch (e) {
      if (e.code) throw e;                                                    // challenge / login / balance problems are not retried
      log('library browse failed (' + e.message + '), opening the game directly'); await p.goto(spec.url, { waitUntil: 'domcontentloaded' }); await sleep(3500);
    }
    await guard(p);
    await gameReady(p);
    await gb.applyView(p, spec.scale || Number(process.env.HUBIE_SCALE || 1.5));      // heavy animations are drawn at a lighter density
    await toTop(p);
    st.target = 50.5; st.chipZero = false; st.status = 'ready';
    send({ t: 'game', game: { id: game.id, name: game.name } });
  }

  // helpers handed to the multi-click games (see housebets_games2.js)
  const labelAt = (p, pt) => p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); const b = e && (e.closest('button') || e); return b ? (b.innerText || '').trim() : ''; }, pt).catch(() => '');
  async function clickAt(p, pt) { await humanMove(p, pt); send({ t: 'cursor', x: pt.x, y: pt.y, click: true }); await p.mouse.click(pt.x, pt.y); }
  async function clickWait(p, pt, api, timeout = 9000) {
    const w = p.waitForResponse((r) => api.test(r.url()) && r.request().method() === 'POST', { timeout });
    if (process.env.HUBIE_DEBUG) log(`click ${pt.x},${pt.y} waiting for ${api}`);
    await clickAt(p, pt);
    let r; try { r = await w; } catch (e) { w.catch(() => {}); throw new Error('no answer from the game after a click: ' + e.message); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok() && !j.game) throw new Error(j.error || 'the game refused the click (HTTP ' + r.status() + ')');
    if (j.error && !j.game?.active && !j.game?.phase) throw new Error(j.error);
    if (j.error) throw new Error(j.error);                       // e.g. an unfinished round in another wallet: never work around it
    return j;
  }
  async function clickText(p, re) {
    const pt = await p.evaluate((src) => { const rx = new RegExp(src, 'i'); const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.width && r.top >= 0 && r.top < 720 && rx.test((x.innerText || '').trim()); }); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, re.source).catch(() => null);
    if (!pt) return false; await clickAt(p, pt); return true;
  }

  async function playRound(game, onOutcome) {
    const spec = SPECS[game.id]; if (!spec) throw new Error('no driver for ' + game.id);
    const p = await gb.getPage();
    await guard(p);
    await toTop(p);                                          // the bet coordinates assume an unscrolled page
    send({ t: 'round', phase: 'start', game: { id: game.id, name: game.name } });
    let o;
    if (spec.play) {                                         // a game that takes several clicks per round
      const PACE = Number(process.env.HUBIE_PACE || 1);
      const c = { p, st, rand, sleep, log, consult: async (q) => (consult ? consult(q) : null), think: (lo = 2200, hi = 4200) => sleep((lo + rand() * (hi - lo)) * PACE), clickAt: (pt) => clickAt(p, pt), clickWait: (pt, api, ms) => clickWait(p, pt, api, ms), watch: (api) => { let last = null; const h = async (r) => { if (api.test(r.url()) && r.request().method() === 'POST') { try { const j = await r.json(); if (j.game) last = j.game; } catch { /* not json */ } } }; p.on('response', h); return { last: () => last, stop: () => p.off('response', h) }; }, expectJson: (api, ms = 9000) => p.waitForResponse((r) => api.test(r.url()) && r.request().method() === 'POST', { timeout: ms }).then((r) => r.json()), labelAt: (pt) => labelAt(p, pt), clickText: (re) => clickText(p, re), pressText: (re) => p.evaluate((src) => { const rx = new RegExp(src, 'i'); const b = [...document.querySelectorAll('button')].find((x) => x.getBoundingClientRect().width && rx.test((x.innerText || '').trim())); if (!b) return false; b.click(); return true; }, re.source).catch(() => false) };
      for (let attemptRound = 0; !o; attemptRound++) {
        try { o = await spec.play.call(spec, c); }
        catch (e) {
          try { await p.screenshot({ path: new URL(`../logs/fail_${game.id}.png`, import.meta.url).pathname }); } catch { /* best effort */ }
          if (attemptRound === 0 && !e.code) {          // the page and the game disagree about the table: reload it once, as a person would, and try again
            log(`${game.name} round failed (${e.message.slice(0, 80)}), reloading the page and trying once more`);
            await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}); await sleep(2500);
            await guard(p); await gameReady(p); await toTop(p); st.chipZero = false;
            continue;
          }
          st.fails++;
          await guard(p); throw new Error('no result came back from the game: ' + e.message);
        }
      }
    } else {
      st.pick = null; st.pickBy = '';
      if (spec.pre) await spec.pre({ st, rand, consult: async (q) => (consult ? consult(q) : null) });      // sometimes ask chat first (risk, heads or tails)
      await spec.vary({ p, st, humanMove, rand });
      await sleep((1200 + rand() * 2600) * Number(process.env.HUBIE_PACE || 1));                              // a moment before pressing Bet, like a person deciding
      let json, lastErr;
      for (let attempt = 0; attempt < 2 && !json; attempt++) {     // a click that placed no bet is retried once, from the top of the page
        if (attempt) { log('no bet response, trying the click again'); await toTop(p); }
        const wait = p.waitForResponse((r) => spec.api.test(r.url()) && r.request().method() === 'POST', { timeout: attempt ? 8000 : 7000 });
        await humanMove(p, spec.bet);
        send({ t: 'cursor', x: spec.bet.x, y: spec.bet.y, click: true });
        await p.mouse.click(spec.bet.x, spec.bet.y);
        try { const r = await wait; json = await r.json(); } catch (e) { lastErr = e; wait.catch(() => {}); }
      }
      if (!json) { st.fails++; await guard(p); throw new Error('no result came back from the game: ' + lastErr?.message); }
      o = spec.parse(json); if (st.pickBy) o.followedChat = st.pickBy;
    }
    st.fails = 0; st.status = 'playing'; st.last = o.detail;
    const [lo, hi] = o.settle || spec.settle;
    const settleMs = lo + rand() * (hi - lo);                // the game's own animation
    const result = { win: o.win, multiplier: r2(o.multiplier), big: o.big, summary: o.summary, detail: o.detail, game: game.id, followedChat: o.followedChat || '', revealAt: Date.now() + settleMs };
    onOutcome?.(result);                      // Hubie can start preparing his reaction now, while the animation plays
    await sleep(settleMs);
    return result;
  }

  return { name: 'housebets', switchGame, playRound, preflight, state: st };
}
