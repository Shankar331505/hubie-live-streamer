// Plays a few zero-stake rounds of the chosen games through the real driver and prints each result. Not a stream: nothing is broadcast.
// usage: node tools/test_games.mjs [rounds] [game ids...]      e.g.  node tools/test_games.mjs 3 blackjack keno
import { createGameBrowser } from '../server/gamebrowser.js';
import { createHousebetsDriver } from '../server/housebets_driver.js';
import { REAL_GAMES } from '../server/games.js';
const rounds = Number(process.argv[2] || 3), want = process.argv.slice(3);
const gb = createGameBrowser({ log: console.log });
// ASK=1: every decision point asks, and a stub "chat" answers with the FIRST option, so the follow-chat path is exercised too
const consult = process.env.ASK ? async (q) => { const o = q.options[0]; const val = o.re ? '17' : undefined; console.log(`  [ask] ${q.game}: ${q.question} -> chat says ${o.id}`); return { choice: o.id, by: 'TestViewer', val, label: o.label }; } : null;
const d = createHousebetsDriver({ gb, send: () => {}, log: (m) => console.log('  [driver]', m), consult });
console.log('preflight balance:', await d.preflight());
if (process.env.HUBIE_NET) { const pg = await gb.getPage(); pg.on('response', async (r) => { if (/games\.housebets\.com/.test(r.url()) && r.request().method() !== 'GET') console.log('   NET', new Date().toISOString().slice(17, 23), r.status(), r.url().slice(27), (await r.text().catch((e) => 'ERR ' + e.message)).slice(0, 90).replace(/\s+/g, ' ')); }); }
let bad = 0;
for (const g of REAL_GAMES.filter((x) => !want.length || want.includes(x.id))) {
  console.log(`\n== ${g.name}`);
  try {
    await d.switchGame(g);
    for (let i = 0; i < rounds; i++) {
      const t = Date.now();
      const r = await d.playRound(g, () => {});
      console.log(`  ${r.win ? 'WIN ' : 'lose'} x${r.multiplier} ${r.big ? '(big) ' : ''}${r.followedChat ? `[followed ${r.followedChat}] ` : ''}| ${r.summary} | ${((Date.now() - t) / 1000).toFixed(1)}s`);
    }
  } catch (e) { bad++; console.log('  ERROR:', e.message); }
}
console.log(bad ? `\n${bad} game(s) had errors` : '\nall games OK');
process.exit(bad ? 1 : 0);
