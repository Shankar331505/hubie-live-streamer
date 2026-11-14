// More House Games for the driver: the ones that take several clicks to play a round (cards, towers, roads) and the table games.
// Every game here is played at ZERO stake like the others; the driver refuses to run unless the balance is exactly zero.
// Each spec has play(c): it does the clicks for one whole round and returns { win, multiplier, big, summary, detail, settle, followedChat }.
// c = { p, st, rand, sleep, think, consult, log, clickWait(pt, apiRegex), clickAt(pt), labelAt(pt), clickText(re), pressText(re), watch(api) }
// (coordinates: 1280x720 page).
//   c.sleep(ms): a fixed wait for an animation.   c.think(lo, hi): a human-length pause, scaled by the show's pace.
//   c.consult({...}): at a real decision, Hubie sometimes asks chat. It returns { choice, by, val } when chat decided, or null (he decides).
//   When chat decided, the round is marked followedChat, so his reaction can tease or thank that viewer.
const base = 'https://www.housebets.com/games/housegames-';
const r2 = (n) => Math.round(n * 100) / 100;
const range = (c, lo, hi) => lo + Math.floor(c.rand() * (hi - lo + 1));
const G = (j) => { if (!j || !j.game) throw new Error((j && j.error) || 'the game sent no round'); return j.game; };
const done = (win, multiplier, big, summary, detail, settle, followed = '') => ({ win, multiplier: win ? r2(multiplier) : 0, big, summary, detail, settle, followedChat: followed });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// answer words chat can use (a message with exactly one of the two options counts)
const GO_WORDS = ['yes', 'yeah', 'yep', 'yup', 'more', 'one more', 'another', 'keep going', 'continue', 'go', 'again', 'next', 'open', 'climb', 'cross', 'swim', 'ok', 'okay', 'sure', 'do it', 'go on'];
const STOP_WORDS = ['no', 'nope', 'cash', 'cash out', 'cashout', 'stop', 'enough', 'out', 'take it', 'leave', 'safe', 'secure', 'done', 'quit'];
const MORE_OPTS = (goLabel) => [{ id: 'yes', label: goLabel, words: GO_WORDS }, { id: 'no', label: 'cash out', words: STOP_WORDS }];
const money = (g) => (g && g.multiplier > 0 ? ` Cashing out now would lock in ${r2(g.multiplier)}x.` : '');


// The table ignores Bet for a moment after a result. Try, wait a little, try again, before giving up on the click.
const patientBet = async (c, pt, api) => {
  for (let attempt = 0; ; attempt++) {
    try { return await c.clickWait(pt, api, attempt ? 9000 : 5500); }
    catch (e) { if (attempt >= 1) throw e; await c.sleep(3000); }
  }
};

export const EXTRA_SPECS = {
  blackjack: {
    url: base + 'blackjack', settle: [1800, 2600],
    async play(c) {
      const API = /games\.housebets\.com\/blackjack7\/(bet|action)/;
      const HIT = { x: 170, y: 436 }, STAND = { x: 247, y: 436 }, BET = { x: 285, y: 424 };
      // The table is drawn on a canvas, so its buttons are not in the page text: what is on screen is read from the game's own answers.
      const needsInsurance = (x) => !!x && x.phase === 'playing' && !!(x.options?.insurance || (x.insurance?.offered && !x.insurance?.decided));
      // "Dealer shows an ace - insurance?": the round waits until Hubie answers. He always says "No thanks" (the button is not a real <button>).
      // Standing on a weak hand (or hitting a strong one) opens a "Stand on 7? ... Stand anyway" pop-up that blocks the table. Confirm it
      // with "anyway" (never "Don't ask again": that would change an account setting), and read the answer from the network.
      const act = async (pt, ms = 7000) => {
        const w = c.watch(API);
        try {
          await c.clickAt(pt); await c.sleep(900);
          if (await c.clickText(/(stand|hit|double|split|surrender) anyway/i)) await c.sleep(600);
          for (let i = 0; i < ms / 250 && !w.last(); i++) await c.sleep(250);
          return w.last();
        } finally { w.stop(); }
      };
      const declineInsurance = async () => {
        const w = c.watch(API);
        try { await c.think(1200, 2400); await c.clickAt({ x: 363, y: 419 }); await c.sleep(2600); return w.last(); } finally { w.stop(); }
      };
      // If a round was left open (a crash, a restart), the Bet button is not there. Poke the table in a safe order: No thanks, then Stand.
      // On an idle table the same two clicks just start a hand and stand on it, so the table always ends up idle.
      const unstick = async () => {
        c.log('blackjack: no answer to Bet, clearing a leftover hand');
        const w = c.watch(API);
        try {
          for (let i = 0; i < 6; i++) {
            const last = w.last();
            if (last && last.phase !== 'playing') break;                                        // settled: the table is idle again
            if (needsInsurance(last) || (!last && i % 2 === 0)) await c.clickAt({ x: 363, y: 419 });   // insurance, or unknown: "No thanks" (on an idle table this is the Bet button)
            else { await c.clickAt(STAND); await c.sleep(900); await c.clickText(/(stand|hit) anyway/i); }   // a hand is open (or no answer to the first poke): stand on it
            await c.sleep(3600);                                                                  // let any dealing animation finish before the next poke
          }
        } finally { w.stop(); }
      };
      let g, followed = '';
      await c.sleep(2200);                                                          // the last hand's dealer animation, when rounds follow closely
      for (let attempt = 0; attempt < 3 && !g; attempt++) {
        try { g = G(await c.clickWait(BET, API, 5500)); }
        catch { if (attempt === 0) await c.sleep(3500); else await unstick(); }    // first a little patience, then clear a leftover hand
      }
      if (!g) throw new Error('the Blackjack table did not answer');
      if (process.env.HUBIE_DEBUG) c.log(`blackjack bet answer: phase=${g.phase} insurance=${JSON.stringify(g.insurance)} options=${JSON.stringify(g.options)}`);
      await c.sleep(1900);                                                          // the buttons ignore clicks until the cards have been dealt
      if (needsInsurance(g)) { const ng = await declineInsurance(); if (ng) g = ng; }
      await c.think(1500, 2800);                                                    // a look at the cards
      for (let n = 0; g.phase === 'playing' && n < 8; n++) {
        if (needsInsurance(g)) { const ng = await declineInsurance(); if (ng) g = ng; if (g.phase !== 'playing') break; }   // never take insurance
        const h = g.hands[Math.max(0, g.turn)] || g.hands[0], up = g.dealer?.value || 10;
        let hit; if (h.soft) hit = h.value <= 17; else if (h.value >= 17) hit = false; else if (h.value <= 11) hit = true; else hit = up >= 7;
        if (!h.soft && h.value >= 12 && h.value <= 16 && g.options?.hit) {                                       // the classic moment to ask chat
          const ans = await c.consult({ game: 'Blackjack', situation: `Hubie has ${h.value} and the dealer shows ${up}.`, question: 'should we hit or stand', optionsText: '"hit" or "stand"',
            options: [{ id: 'hit', label: 'hit', words: ['hit', 'hits', 'another', 'card', 'one more', 'twist', 'draw'] }, { id: 'stand', label: 'stand', words: ['stand', 'stay', 'hold', 'stick', 'no more', 'freeze'] }] });
          if (ans) { hit = ans.choice === 'hit'; followed = ans.by; }
        }
        if (!g.options?.hit) hit = false;
        await c.think(2200, 4000);                                                  // a person thinks before clicking
        let ng = await act(hit ? HIT : STAND);
        if (!ng) { await c.sleep(2200); ng = await act(hit ? HIT : STAND); }                                    // the buttons were still busy dealing: once more
        if (!ng) throw new Error('the Blackjack table did not answer the click');
        g = ng;
        if (g.phase === 'playing') await c.sleep(1600);                             // let the new card land before the next decision
      }
      const h = g.hands[0], hv = h.value, dv = g.dealer.value, out = String(h.outcome || '');
      const bust = hv > 21, natural = !!h.natural || /blackjack/i.test(out);
      if (/push|tie/i.test(out)) return done(false, 1, false, `a tie: Hubie and the dealer both had ${hv}`, { player: hv, dealer: dv, outcome: 'push' }, this.settle, followed);
      if (natural && /win|blackjack/i.test(out)) return done(true, 2.5, true, 'a blackjack: a natural 21 on the first two cards', { player: 21, dealer: dv, outcome: 'blackjack' }, this.settle, followed);
      if (/win/i.test(out)) return done(true, 2, false, dv > 21 ? `a win: the dealer busted with ${dv} while Hubie stayed on ${hv}` : `a win: Hubie's ${hv} beat the dealer's ${dv}`, { player: hv, dealer: dv, outcome: 'win' }, this.settle, followed);
      return done(false, 0, false, bust ? `a loss: Hubie went bust with ${hv}` : `a loss: the dealer's ${dv} beat Hubie's ${hv}`, { player: hv, dealer: dv, outcome: 'lose' }, this.settle, followed);
    },
  },

  keno: {
    url: base + 'keno', settle: [3500, 4500],
    async play(c) {
      const API = /games\.housebets\.com\/keno2\/bet/;
      const picked = await c.p.evaluate(() => { const m = document.body.innerText.match(/Numbers\s*(\d+)\s*\/\s*10/); return m ? Number(m[1]) : 0; });
      if (!picked || c.rand() < 0.35) { await c.clickAt({ x: 208, y: 407 }); await c.sleep(600); await c.think(1200, 2200); }   // Auto pick: a fresh set of numbers
      if (c.rand() < 0.3) { const r = [[170, 333], [247, 333], [324, 333], [400, 333]][range(c, 0, 3)]; await c.clickAt({ x: r[0], y: r[1] }); await c.sleep(300); }
      await c.think(1500, 3000);
      const g = G(await c.clickWait({ x: 285, y: 474 }, API));
      const m = Number(g.multiplier) || 0, win = m >= 1, hits = g.hits ?? 0, spots = (g.spots || []).length || 10;
      return done(win, m, win && m >= 10, `${win ? 'a win' : 'a miss'}: ${hits} of ${spots} picked numbers were drawn (${g.risk} risk)${win ? `, paying ${r2(m)}x` : ''}`, { hits, spots, risk: g.risk, multiplier: m }, this.settle);
    },
  },

  hilo: {
    url: base + 'hilo', settle: [700, 1100],
    async play(c) {
      const API = /games\.housebets\.com\/hilo2\/(bet|action)/, BTN = { x: 285, y: 524 }, HI = { x: 285, y: 340 }, LO = { x: 285, y: 396 };
      // The table's controls are not real <button>s, so what is open is remembered from the game's own answers (c.st.hilo).
      // A round this program left open is finished first; one it does not know about (after a restart) is cleared by a guess and a cash-out.
      const keep = (j) => { const x = G(j); c.st.hilo = x; return x; };
      let lg = c.st.hilo;
      if (lg && lg.phase === 'playing') {
        try {
          if (!lg.options?.cashout) { lg = keep(await c.clickWait(HI, API, 6000)); await c.sleep(1500); }
          if (lg.phase === 'playing') { lg = keep(await c.clickWait(BTN, API, 6000)); await c.sleep(1500); }
        } catch { /* the guess lost or the round is already over */ }
      }
      let g, followed = '';
      try { g = keep(await patientBet(c, BTN, API)); }
      catch {
        c.log('Hilo: no answer to Bet, clearing a leftover round');
        try { await c.clickWait(HI, API, 5000); await c.sleep(1500); await c.clickWait(BTN, API, 4000); } catch { /* nothing left to clear */ }
        await c.sleep(2000); g = keep(await c.clickWait(BTN, API));
      }
      await c.sleep(1200); await c.think(1500, 2800);
      const want = range(c, 1, 3); let right = 0, last = '', guesses = 0;
      while (g.phase === 'playing') {
        if (right >= 1) {                                                                                            // after a right guess: keep going or cash out?
          let keep = right < want;
          const ans = await c.consult({ game: 'Hilo', situation: `Hubie has guessed ${plural(right, 'card')} right in a row.${money(g)}`, question: 'should we guess another card or cash out', optionsText: '"keep going" or "cash out"', options: MORE_OPTS('keep going') });
          if (ans) { keep = ans.choice === 'yes'; followed = ans.by; }
          if (!keep || guesses >= 6) break;
        }
        const hi = g.options?.hi, lo = g.options?.lo;
        let side = hi && lo ? (hi.n >= lo.n ? 'hi' : 'lo') : hi ? 'hi' : 'lo';                                       // usually the likelier side
        if (hi && lo && c.rand() < 0.2) side = side === 'hi' ? 'lo' : 'hi';                                           // sometimes a gutsy call
        if (hi && lo) {
          const ans = await c.consult({ game: 'Hilo', situation: 'The next card is about to be turned over.', question: 'will the next card be higher or lower', optionsText: '"higher" or "lower"',
            options: [{ id: 'hi', label: 'higher', words: ['higher', 'high', 'up', 'hi', 'above', 'bigger'] }, { id: 'lo', label: 'lower', words: ['lower', 'low', 'down', 'lo', 'below', 'smaller'] }] });
          if (ans) { side = ans.choice; followed = ans.by; }
        }
        await c.think(2200, 4000);
        last = side; guesses++; g = keep(await c.clickWait(side === 'hi' ? HI : LO, API));
        const ev = g.events?.[g.events.length - 1]; if (ev?.win) right++; else break;
        await c.sleep(1100);
      }
      if (g.phase === 'playing') { await c.think(1500, 2800); g = keep(await c.clickWait(BTN, API)); }                  // cash out
      const m = r2(Number(g.multiplier) || 0), win = g.outcome === 'cashout' && right > 0;
      const word = last === 'hi' ? 'higher' : 'lower';
      return done(win, m, win && m >= 4, win ? `a win: guessed ${plural(right, 'card')} right and cashed out at ${m}x` : `a miss: guessed ${word} but the next card went the other way${right ? ` after ${right} right` : ''}`, { right, multiplier: m }, this.settle, followed);
    },
  },

  'dragon-tower': {
    url: base + 'dragon-tower', settle: [1000, 1600],
    async play(c) {
      const API = /games\.housebets\.com\/tower\/(bet|action)/, BET = { x: 285, y: 428 }, CASH = { x: 285, y: 492 };
      if (/random pick/i.test((await c.labelAt(BET)) || '')) {                                                     // a leftover round: finish it first
        try { await c.clickWait(CASH, API, 4000); }
        catch { try { await c.clickWait(BET, API, 5000); await c.sleep(1500); await c.clickWait(CASH, API, 4000); } catch { /* a trap ended it */ } }
        await c.sleep(1500);
      }
      let g = G(await patientBet(c, BET, API)), followed = '';
      const plan = range(c, 2, 4); let climbed = 0;
      await c.sleep(900); await c.think(1500, 2800);
      while (g.phase === 'playing' && climbed < 8) {
        let go = climbed < plan;
        if (climbed >= 1) {                                                                                          // one more floor or cash out?
          const ans = await c.consult({ game: 'Dragon Tower', situation: `Hubie has climbed ${plural(climbed, 'floor')} of the castle tower.${money(g)} A trap could be on the next floor.`, question: 'should we climb one more floor or cash out', optionsText: '"climb" or "cash out"', options: MORE_OPTS('climb') });
          if (ans) { go = ans.choice === 'yes'; followed = ans.by; }
        }
        if (!go) break;
        await c.think(2500, 4500);
        g = G(await c.clickWait(BET, API)); climbed++;                                                               // the Random pick button takes one floor
        if (g.phase === 'playing') await c.sleep(1400);
      }
      if (g.phase === 'playing') { await c.think(1500, 2800); g = G(await c.clickWait(CASH, API)); }
      const m = r2(Number(g.multiplier) || 0), win = g.outcome === 'cashout';
      return done(win, m, win && m >= 5, win ? `a win: climbed ${plural(g.position || climbed, 'floor')} and cashed out at ${m}x` : `a miss: stepped on a trap on floor ${(g.position || 0) + 1}`, { floors: g.position, multiplier: m }, this.settle, followed);
    },
  },

  baccarat: {
    url: base + 'baccarat', settle: [4500, 5500],
    async play(c) {
      const API = /games\.housebets\.com\/baccarat\/bet/;
      const r = c.rand(); let side = r < 0.45 ? 'player' : r < 0.9 ? 'banker' : 'tie', followed = '';
      const ans = await c.consult({ game: 'Baccarat', situation: 'The cards are about to be dealt.', question: 'should we call player, banker or tie', optionsText: '"player", "banker" or "tie"',
        options: [{ id: 'player', label: 'player', words: ['player', 'players'] }, { id: 'banker', label: 'banker', words: ['banker', 'bank', 'house'] }, { id: 'tie', label: 'tie', words: ['tie', 'draw', 'tied'] }] });
      if (ans) { side = ans.choice; followed = ans.by; }
      await c.think(1500, 3000);
      await c.clickAt({ player: { x: 607, y: 572 }, banker: { x: 1085, y: 572 }, tie: { x: 846, y: 572 } }[side]); await c.sleep(500);
      await c.think(800, 1600);
      const g = G(await c.clickWait({ x: 285, y: 464 }, API));
      const pt = g.player?.total, bt = g.banker?.total, out = g.outcome, win = out === side;
      const outWord = out === 'tie' ? 'the hand was a tie' : `${out} won`;
      return done(win, side === 'tie' ? 9.4 : side === 'banker' ? 1.95 : 2, win && side === 'tie', `${win ? 'a win' : 'a miss'}: Hubie called ${side}, and ${outWord}, player ${pt} against banker ${bt}`, { called: side, outcome: out, player: pt, banker: bt }, this.settle, followed);
    },
  },

  roulette: {
    scale: Number(process.env.HUBIE_HEAVY_SCALE || 1),
    url: base + 'roulette', settle: [6500, 8000],
    async play(c) {
      const API = /games\.housebets\.com\/roulette2\/bet/;
      // Zero-stake play needs the Chip Value at 0 (it starts at 1, and a chip cannot be placed on an empty balance). The field is drawn by the
      // game itself, so it cannot be read back: if the bet does not go through, the zero is set again, slower, and the round retried once.
      const setZero = async (slow) => {
        await c.p.bringToFront().catch(() => {});
        await c.sleep(slow ? 1800 : 500);
        await c.clickAt({ x: 200, y: 248 }); await c.sleep(slow ? 900 : 450);
        await c.p.keyboard.press('ControlOrMeta+A'); await c.p.keyboard.type('0'); await c.p.keyboard.press('Tab'); await c.sleep(slow ? 1200 : 700);
        c.st.chipZero = true;
      };
      const numXY = (n) => (n === 0 ? { x: 498, y: 463 } : { x: Math.round(546 + (Math.ceil(n / 3) - 1) * 54.6), y: n % 3 === 0 ? 419 : n % 3 === 2 ? 463 : 507 });
      const spots = {
        red: { label: 'red', x: 791, y: 589, hit: (n, col) => col === 'red', mult: 2 }, black: { label: 'black', x: 900, y: 589, hit: (n, col) => col === 'black', mult: 2 },
        odd: { label: 'odd', x: 1010, y: 589, hit: (n) => n > 0 && n % 2 === 1, mult: 2 }, even: { label: 'even', x: 683, y: 589, hit: (n) => n > 0 && n % 2 === 0, mult: 2 },
        low: { label: '1 to 18', x: 573, y: 589, hit: (n) => n >= 1 && n <= 18, mult: 2 }, high: { label: '19 to 36', x: 1120, y: 589, hit: (n) => n >= 19, mult: 2 },
      };
      const straight = (n) => ({ label: `number ${n}`, ...numXY(n), hit: (pocket) => pocket === n, mult: 36 });
      const keys = Object.keys(spots);
      let spot = c.rand() < 0.75 ? spots[keys[range(c, 0, keys.length - 1)]] : straight(range(c, 0, 36)), followed = '';
      const ans = await c.consult({ game: 'Roulette', situation: 'The wheel is ready and Hubie is about to put his chip down.', question: 'where should I put my chip', optionsText: '"red", "black", "odd", "even", or a number',
        options: [{ id: 'red', label: 'red', words: ['red'] }, { id: 'black', label: 'black', words: ['black'] }, { id: 'odd', label: 'odd', words: ['odd', 'odds'] }, { id: 'even', label: 'even', words: ['even', 'evens'] },
          { id: 'num', label: 'a number', re: / (0|[1-9]|[12]\d|3[0-6]) / }] });
      if (ans) { followed = ans.by; spot = ans.choice === 'num' ? straight(Number(ans.val)) : spots[ans.choice]; }
      let g = null, lastErr = null;
      for (let attempt = 0; attempt < 2 && !g; attempt++) {
        if (!c.st.chipZero || attempt) await setZero(attempt > 0);
        await c.think(1200, 2500);
        await c.clickAt({ x: spot.x, y: spot.y }); await c.sleep(attempt ? 900 : 450);
        await c.think(800, 1800);
        try { g = G(await c.clickWait({ x: 285, y: 508 }, API, 6000)); } catch (e) { lastErr = e; c.st.chipZero = false; }
      }
      if (!g) throw lastErr;
      const n = Number(g.pocket), col = g.color, win = spot.hit(n, col);
      return done(win, spot.mult, win && spot.mult >= 36, `${win ? 'a win' : 'a miss'}: the ball landed on ${n} ${col}, and Hubie had put his chip on ${spot.label}`, { pocket: n, color: col, spot: spot.label }, this.settle, followed);
    },
  },

  'hubie-s-road': {
    url: base + 'hubie-s-road', settle: [1500, 2200],
    async play(c) {
      const API = /games\.housebets\.com\/road\/(bet|action)/, BTN = { x: 285, y: 387 }, CASH = { x: 285, y: 452 };
      if (/^go/i.test((await c.labelAt(BTN)) || '')) {                                                              // a leftover crossing: finish it first
        try { await c.clickWait(CASH, API, 4000); }
        catch { try { await c.clickWait(BTN, API, 5000); await c.sleep(1500); await c.clickWait(CASH, API, 4000); } catch { /* the shark ended it */ } }
        await c.sleep(1500);
      }
      let g = G(await patientBet(c, BTN, API)), followed = '';
      const plan = range(c, 2, 5); let steps = 0;
      await c.sleep(900); await c.think(1500, 2800);
      while (g.phase === 'playing' && steps < 10) {
        let go = steps < plan;
        if (steps >= 1) {                                                                                            // one more lane or cash out?
          const ans = await c.consult({ game: "Hubie's Road", situation: `Hubie has crossed ${plural(steps, 'lane')} of the sea road with a shark about.${money(g)}`, question: 'should we cross one more lane or cash out', optionsText: '"go" or "cash out"', options: MORE_OPTS('go one more lane') });
          if (ans) { go = ans.choice === 'yes'; followed = ans.by; }
        }
        if (!go) break;
        await c.think(2500, 4500);
        g = G(await c.clickWait(BTN, API)); steps++;                                                                 // Go: one lane further
        if (g.phase === 'playing') await c.sleep(1500);
      }
      if (g.phase === 'playing') { await c.think(1500, 2800); g = G(await c.clickWait(CASH, API)); }
      const m = r2(Number(g.multiplier) || 0), win = g.outcome === 'cashout';
      return done(win, m, win && m >= 5, win ? `a win: crossed ${plural(g.position || steps, 'lane')} and cashed out at ${m}x` : `a miss: a shark got Hubie on lane ${(g.position || 0) + 1}`, { lanes: g.position, multiplier: m }, this.settle, followed);
    },
  },

  mines: {
    url: base + 'mines', settle: [1000, 1600],
    async play(c) {
      const BET = { x: 285, y: 452 }, RANDOM = { x: 285, y: 516 };
      const COLS = [618, 732, 846, 960, 1074], ROWS = [184, 298, 412, 526, 640];
      const ACT = /games\.housebets\.com\/mines2\/action/;
      if (/cash out/i.test((await c.labelAt(BET)) || '')) {                                                         // a leftover round: finish it first
        try { await c.clickWait(BET, ACT, 4000); }
        catch { try { await c.clickWait(RANDOM, ACT, 5000); await c.sleep(1500); await c.clickWait(BET, ACT, 4000); } catch { /* a mine ended it */ } }
        await c.sleep(1500);
      }
      await c.pressText(/clear (picks|board)/i); await c.sleep(400);                                                                        // picks from the last round stay selected
      // pick a first tile, then Bet: the bet reveals it (and any tile still selected from before, so read the settled state, not one response)
      const w = c.watch(/games\.housebets\.com\/mines2\/(bet|action)/);
      let g, gems = 1, followed = '';
      try {
        await c.think(1200, 2500);
        await c.clickAt({ x: COLS[range(c, 0, 4)], y: ROWS[range(c, 0, 4)] }); await c.sleep(500);
        g = G(await patientBet(c, BET, /games\.housebets\.com\/mines2\/bet/));
        await c.sleep(2200);                                                                                      // the buttons wait for the reveal animation
        g = w.last() || g;
      } finally { w.stop(); }
      const plan = range(c, 0, 2); let steps = 0;
      while (g.phase === 'playing' && steps < 6) {
        gems = g.opened?.length || gems;
        let go = steps < plan;
        const ans = await c.consult({ game: 'Mines', situation: `Hubie has found ${plural(gems, 'gem')} and the next tile could hide a mine.${money(g)}`, question: 'should we open one more tile or cash out', optionsText: '"one more" or "cash out"', options: MORE_OPTS('open one more') });
        if (ans) { go = ans.choice === 'yes'; followed = ans.by; }
        if (!go) break;
        await c.think(3000, 5500);                                                                                // one tile at a time, slowly
        try { g = G(await c.clickWait(RANDOM, ACT, 7000)); } catch { await c.sleep(1500); g = G(await c.clickWait(RANDOM, ACT)); }   // one retry
        steps++;
        if (g.phase === 'playing') await c.sleep(1500);
      }
      if (g.phase === 'playing') { await c.think(1800, 3200); g = G(await c.clickWait(BET, ACT)); }               // cash out
      const m = r2(Number(g.multiplier) || 0), win = g.outcome === 'cashout' || (g.phase === 'settled' && !g.hit && m > 0);
      return done(win, m, win && m >= 5, win ? `a win: found ${plural(g.opened?.length || gems, 'gem')} and cashed out at ${m}x` : `a miss: the tile hid a mine after ${plural(Math.max(0, (g.opened?.length || gems)), 'gem')}`, { gems: g.opened?.length, multiplier: m, mines: g.mines }, this.settle, followed);
    },
  },
};
