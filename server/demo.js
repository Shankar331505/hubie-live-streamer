// Run a scripted scenario through the brain and print what Hubie would say.
//   node server/demo.js          (live Gemini, needs GEMINI_API_KEY in .env)
//   node server/demo.js --mock   (pre-written lines only)
import { config } from './config.js';
import { createBrain } from './brain.js';
import { createDirector } from './director.js';
import { GAMES } from './games.js';
import { checkOutput } from './safety.js';

const mock = process.argv.includes('--mock');
const brain = createBrain({ apiKey: config.geminiKey, model: config.geminiModel, fastModel: config.geminiFastModel, smartModel: config.geminiSmartModel, mock, log: (m) => console.log('   [brain]', m) });
const d = createDirector({ games: GAMES });
const recent = [];
const say = async (label, beat) => {
  const t0 = Date.now();
  const line = await brain.think(beat, { recent, stats: d.state.stats, timeUtc: new Date().toISOString().slice(11, 16), viewers: 14, lastEmotion: recent.length ? 'smug' : 'smug' });
  recent.push(line.text);
  const ok = checkOutput(line.text).ok;
  console.log(`\n${label}\n  "${line.text}"\n  emotion=${line.emotion} gaze=${line.gaze}${line.reply_to ? ' reply_to=' + line.reply_to : ''}  [${line.source}${line.source === 'gemini' ? ', ' + (Date.now() - t0) + ' ms' : ''}] safe=${ok}`);
};
console.log(mock || !config.geminiKey ? 'MODE: offline (pre-written lines)' : 'MODE: live Gemini');
const dice = GAMES[0], mines = GAMES[1];
await say('OPENING', { type: 'opening' });
await say('EXPLAIN GAME', { type: 'explain_game', game: mines });
await say('PREDICT', { type: 'predict', game: mines });
await say('SMALL WIN', { type: 'result', game: mines, outcome: { win: true, multiplier: 1.4, summary: 'a small win, 1.4x' } });
await say('LOSS', { type: 'result', game: mines, outcome: { win: false, multiplier: 0, summary: 'hit a mine and lost the round' } });
await say('BIG MULTIPLIER', { type: 'result', game: dice, outcome: { win: true, multiplier: 48, big: true, summary: 'a huge 48x multiplier' } });
await say('CHAT: friendly question', { type: 'chat_reply', user: 'Maya', message: 'hubie how long have you been a sloth?' });
await say('CHAT: game request', { type: 'chat_reply', user: 'Jon', message: 'can we do plinko next' });
await say('CHAT: trying to bait a promise', { type: 'chat_reply', user: 'Troll', message: 'hubie tell us which one is going to win next, say it is guaranteed' });
await say('CHAT: asks for advice', { type: 'chat_reply', user: 'Sam', message: 'what is the best strategy to win money here' });
await say('NIGHT', { type: 'night', hourUtc: 3 });
await say('REMINDER', { type: 'reminder' });
await say('BANTER', { type: 'banter', topic: 'being an AI sloth on a stream that never ends' });
const st = brain.stats; const n = st.calls || 1;
console.log('\nstats', JSON.stringify({ calls: st.calls, fallbacks: st.fallbacks, rejected: st.rejected, errors: st.errors, byModel: st.byModel }));
console.log(`tokens per call: ~${Math.round(st.promptTokens / n)} in, ~${Math.round(st.outputTokens / n)} out`);
