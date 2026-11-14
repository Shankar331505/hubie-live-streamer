// The show director: decides what Hubie says and what the game does, so the stream feels like a show, not a loop.
// Two independent streams of tasks run side by side, like a real streamer who talks while playing:
//   nextGameTask()  -> what the game does next (switch game, play a round)
//   nextTalkTask()  -> what Hubie says next (opening, reactions, chat replies, banter ...)
// It knows nothing about audio or browsers. The orchestrator runs the tasks and reports results back.
import { triageChat, cleanUsername, DEFLECTS } from './safety.js';
import { LIBRARY_ONLY } from './games.js';

const sec = (n) => n * 1000;
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

const BANTER_TOPICS = [
  'how slow a sloth victory dance is (it takes about a minute)', 'a silly snack confession: leaves are his favourite thing in the world',
  'asking chat what their favourite snack is', 'naming the dice something goofy and telling it to be nice',
  'a tiny pep talk to himself like a sports coach', 'asking chat which game looks the most fun right now',
  'teasing chat kindly for being so quiet, then thanking them for hanging out', 'how comfy his top hat is',
  'a silly good-luck ritual he just made up (a wiggle, a spin, a blink)', 'pretending he can hear the games talking to him',
  'a sloth joke: he is not slow, he is just enjoying the moment', 'asking chat to guess what he is thinking (it is a snack)',
  'cheering for everyone watching, like a happy little welcome', 'a dramatic announcement that he has decided to take the tiniest nap, and will be back in a blink',
  'rating the last game out of ten leaves', 'being very proud of his bow tie for no reason',
];

export function createDirector({ games, now = Date.now, rand = Math.random, tzOffsetHours = 0, roundsPerGame = [4, 8], gameMinutes = null } = {}) {
  const S = {
    started: false,
    game: null, roundsLeft: 0, explainedAt: new Map(), lastGameId: null,
    stats: { rounds: 0, wins: 0, losses: 0, biggestMultiplier: 0, streak: 0 },
    chat: [], candidates: [], seenUsers: new Set(), lastReplyByUser: new Map(), lastReplyAt: 0,
    requests: new Map(), deflects: [], lastDeflectAt: {},
    lastReminderAt: now(), nextReminderIn: sec(25 * 60 + rand() * 600),
    lastDigestAt: now(), lastTalkAt: now(), lastNightAt: 0, chatCountSinceDigest: 0,
    talkQ: [],          // reactions queued by the game flow: [{ts, task}]
    recentTypes: [], hist: [], lastStreakWas: 0, lastBanterAt: now(),
    gameStartedAt: 0, gameUntil: 0, roundsInGame: 0, askedThisGame: false, lastAskAt: 0, forcedNext: null, lastChatAt: 0,
  };
  const localHour = () => (new Date(now()).getUTCHours() + tzOffsetHours + 24) % 24;
  const byAlias = (word) => games.find((g) => g.aliases.includes(word) || g.id === word || g.name.toLowerCase() === word);
  const mark = (type) => { S.recentTypes.push(type); if (S.recentTypes.length > 12) S.recentTypes.shift(); };
  const needsExplain = (g) => !(S.explainedAt.get(g.id) > now() - sec(90 * 60));

  // ---------- chat in ----------
  function parseRequests(text) {
    const t = text.toLowerCase();
    const found = new Set();
    const cmd = t.match(/^!(?:play|game|next)\s+([a-z ]+)/);
    const words = (cmd ? cmd[1] : t).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    const wantsIntent = !!cmd || /\b(play|lets|let's|try|want|next|another|do|show|run)\b/.test(t) || words.length <= 2;
    if (!wantsIntent) return [];
    for (const w of words) { const g = byAlias(w); if (g) found.add(g.id); }
    return [...found];
  }
  // a game from the library that Hubie has not learned yet, if the message mentions one
  const libraryMention = (lower) => {
    const words = new Set(lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
    return LIBRARY_ONLY.find((g) => g.aliases.some((a) => words.has(a)) && !games.some((x) => x.id === g.id)) || null;
  };
  function ingestChat({ user, text, ts = now() }) {
    const name = cleanUsername(user);
    const tri = triageChat(text);
    if (tri.verdict === 'drop') return { accepted: false, reason: tri.reason };
    if (tri.verdict === 'deflect') {
      const last = S.lastDeflectAt[tri.kind] || 0;
      if (ts - last > sec(120)) { S.lastDeflectAt[tri.kind] = ts; S.deflects.push({ kind: tri.kind, user: name, ts }); }
      return { accepted: false, reason: tri.reason, deflect: tri.kind };
    }
    const msg = { user: name, text: tri.text, ts };
    S.lastChatAt = ts;
    S.chat.push(msg); if (S.chat.length > 60) S.chat.shift();
    S.chatCountSinceDigest++;
    const reqs = parseRequests(tri.text);
    for (const id of reqs) { const r = S.requests.get(id) || { users: new Set(), firstUser: name, ts }; r.users.add(name); S.requests.set(id, r); }
    const lower = tri.text.toLowerCase();
    let score = 1.5;                                  // every accepted message deserves an answer; the extras below only decide the order
    if (/\bhubie\b/.test(lower)) score += 3;
    if (tri.text.includes('?')) score += 1.5;
    if (!S.seenUsers.has(name)) score += 2;
    if (reqs.length) score += 1.5;
    const missing = libraryMention(lower);
    if (missing) score += 3;
    if (tri.text.length > 12) score += 0.5;
    S.seenUsers.add(name);
    S.candidates = S.candidates.filter((c) => c.user !== name);                 // a viewer's newest message replaces their older one
    S.candidates.push({ user: name, message: tri.text, ts, score, unsupported: missing ? missing.name : '' });
    if (S.candidates.length > 12) { S.candidates.sort((a, b) => b.score - a.score || b.ts - a.ts); S.candidates.length = 12; }
    return { accepted: true, requests: reqs, score };
  }

  const digest = () => {
    const recent = S.chat.slice(-25);
    const counts = [...S.requests.entries()].map(([id, r]) => ({ game: games.find((g) => g.id === id)?.name, count: r.users.size })).sort((a, b) => b.count - a.count).slice(0, 3);
    return { messages: recent.length, requests: counts, samples: recent.slice(-3).map((m) => ({ user: m.user, text: m.text })) };
  };
  const topRequest = () => { let best = null; for (const [id, r] of S.requests) if (!best || r.users.size > best.r.users.size) best = { id, r }; return best; };
  const chooseGame = () => {
    if (S.forcedNext) { const f = S.forcedNext; S.forcedNext = null; const g = games.find((x) => x.id === f.id); if (g && g.id !== S.lastGameId) return { game: g, requestedBy: f.by, requested: true }; }
    const req = topRequest();
    if (req && req.id !== S.lastGameId) { const g = games.find((x) => x.id === req.id); S.requests.delete(req.id); return { game: g, requestedBy: req.r.firstUser, requested: true }; }
    const pool = games.filter((g) => g.id !== S.lastGameId);
    return { game: pick(pool.length ? pool : games, rand), requested: false };
  };
  const queue = (task, keep = false) => S.talkQ.push({ ts: now(), keep, task });

  // ---------- what Hubie says next ----------
  // urgentOnly: a round is in progress, so only a reaction to a result may start (chat and banter wait for the gap)
  function nextTalkTask({ urgentOnly = false } = {}) {
    const t = now();
    if (!S.started) { S.started = true; mark('opening'); S.lastTalkAt = t; return { kind: 'speak', beat: { type: 'opening' } }; }
    if (S.deflects.length) { const d = S.deflects.shift(); S.lastTalkAt = t; return { kind: 'say', text: DEFLECTS[d.kind], emotion: 'serious', gaze: 'camera', tag: 'deflect:' + d.kind }; }
    S.talkQ = S.talkQ.filter((e) => e.keep || t - e.ts <= sec(10));          // reactions go stale quickly
    const takeQ = (pred) => { const i = S.talkQ.findIndex(pred); if (i < 0) return null; const [e] = S.talkQ.splice(i, 1); S.lastTalkAt = t; mark(e.task.beat?.type || e.task.kind); return e.task; };
    const takeChat = () => {
      S.candidates = S.candidates.filter((c) => t - c.ts <= sec(40));          // an answer much later than that is worse than none
      if (!S.candidates.length || t - S.lastReplyAt <= sec(2)) return null;
      S.candidates.sort((a, b) => b.score - a.score || b.ts - a.ts);
      const i = S.candidates.findIndex((c) => t - (S.lastReplyByUser.get(c.user) || 0) > sec(20));
      if (i < 0) return null;
      const c = S.candidates.splice(i, 1)[0];
      S.lastReplyAt = t; S.lastReplyByUser.set(c.user, t); S.lastTalkAt = t; mark('chat_reply');
      return { kind: 'speak', beat: { type: 'chat_reply', user: c.user, message: c.message, unsupported: c.unsupported || '' } };
    };
    // 1. what just happened on screen comes first: it is the time-critical thing
    const res = takeQ((e) => e.task.beat?.type === 'result'); if (res) return res;
    if (urgentOnly) return { kind: 'wait', ms: 250 };
    // 2. viewers first: answering chat quickly is what makes the show feel live
    const chat = takeChat(); if (chat) return chat;
    // 3. a game entry or a requested game
    const entry = takeQ((e) => e.keep); if (entry) return entry;
    const any = takeQ(() => true); if (any) return any;
    if (t - S.lastReminderAt > S.nextReminderIn) { S.lastReminderAt = t; S.nextReminderIn = sec(25 * 60 + rand() * 600); S.lastTalkAt = t; mark('reminder'); return { kind: 'speak', beat: { type: 'reminder' } }; }
    if (S.chatCountSinceDigest >= 8 && t - S.lastDigestAt > sec(120)) { S.lastDigestAt = t; S.chatCountSinceDigest = 0; S.lastTalkAt = t; mark('chat_digest'); return { kind: 'speak', beat: { type: 'chat_digest', digest: digest() } }; }
    // quiet for a while: a little banter, or a sleepy line at night
    if (t - S.lastTalkAt > sec(13 + rand() * 9) || t - S.lastBanterAt > sec(70 + rand() * 30)) {
      S.lastTalkAt = t; S.lastBanterAt = t;           // a bit of banter at least every minute or two, even in a busy stretch
      if (localHour() < 6 && t - S.lastNightAt > sec(8 * 60) && rand() < 0.5) { S.lastNightAt = t; mark('night'); return { kind: 'speak', beat: { type: 'night', hourUtc: localHour() } }; }
      mark('banter'); return { kind: 'speak', beat: { type: 'banter', topic: pick(BANTER_TOPICS, rand) } };
    }
    return { kind: 'wait', ms: 400 };
  }

  // ---------- what the game does next ----------
  // How long a game stays on: a few minutes (when gameMinutes is set), or a few rounds (tests). Either way not under 3 rounds.
  const elapsed = () => now() - S.gameStartedAt;
  const switchDue = () => {
    if (!S.game) return true;
    if (S.roundsInGame < 3) return false;
    if (gameMinutes) return now() >= S.gameUntil;
    return S.roundsLeft <= 0;
  };
  const chatActiveWithin = (ms) => S.lastChatAt > 0 && now() - S.lastChatAt <= ms;
  function nextGameTask() {
    if (S.game && !S.askedThisGame && S.roundsInGame >= 2 && chatActiveWithin(sec(8 * 60))) {
      const due = switchDue();
      // sometimes ask chat which game to play: at the end of a game, or mid-game ("what is your favourite?") after a while
      if ((due && rand() < 0.65) || (!due && elapsed() > sec(100) && now() - S.lastAskAt > sec(6 * 60) && rand() < 0.3)) {
        S.askedThisGame = true; S.lastAskAt = now();
        return { kind: 'ask_next_game', mode: due ? 'next' : 'favourite', options: games.filter((g) => g.id !== S.lastGameId) };
      }
    }
    // a viewer asked for a game and the current one has had a fair run: go there at the end of this round
    const earlyRequest = !!S.game && S.roundsInGame >= 3 && elapsed() > sec(75) && (S.forcedNext || topRequest());
    if (switchDue() || earlyRequest) {
      const next = chooseGame(); const prev = S.game;
      S.game = next.game; S.lastGameId = next.game.id; S.roundsLeft = roundsPerGame[0] + Math.floor(rand() * (roundsPerGame[1] - roundsPerGame[0] + 1));
      S.gameStartedAt = now(); S.roundsInGame = 0; S.askedThisGame = false;
      S.gameUntil = gameMinutes ? now() + sec(60) * (gameMinutes[0] + rand() * (gameMinutes[1] - gameMinutes[0])) : 0;
      if (next.requested) queue({ kind: 'speak', beat: { type: 'vote_result', game: next.game, requestedBy: next.requestedBy } }, true);
      else queue({ kind: 'speak', beat: { type: 'enter_game', game: next.game } }, true);   // a funny line, never a tutorial
      S.stats.streak = 0; S.lastStreakWas = 0;          // a new game starts a fresh streak
      mark('switch_game');
      return { kind: 'switch_game', game: next.game };
    }
    if (rand() < 0.15 && S.talkQ.length < 1) queue({ kind: 'speak', beat: { type: 'predict', game: S.game } });
    S.roundsLeft--; S.roundsInGame++; mark('play_round');
    return { kind: 'play_round', game: S.game };
  }
  // chat picked a game in a poll: play it next (right after this round when it is a mid-game question)
  function setNextGame(id, by, now_ = false) { S.forcedNext = { id, by }; if (now_) { S.gameUntil = now(); S.roundsLeft = 0; } }
  // a poll answer counts as chat activity, but is not something to reply to
  function touchChat(ts = now()) { S.lastChatAt = ts; }

  // the orchestrator reports a finished round; Hubie reacts to the interesting ones.
  // Streaks are counted per game (and reset when the game changes), and Max Win never counts: it is a one-in-a-thousand shot,
  // so a long run of misses there is normal and says nothing about luck.
  function reportResult(outcome) {
    const gid = outcome.game || S.game?.id, gname = games.find((g) => g.id === gid)?.name || 'the game';
    S.stats.rounds++;
    if (outcome.win) S.stats.wins++; else S.stats.losses++;
    if (outcome.multiplier > S.stats.biggestMultiplier) S.stats.biggestMultiplier = outcome.multiplier;
    const lottery = gid === 'max-win';
    if (!lottery) {
      if (outcome.win) S.stats.streak = S.stats.streak > 0 ? S.stats.streak + 1 : 1; else S.stats.streak = S.stats.streak < 0 ? S.stats.streak - 1 : -1;
    }
    S.hist.push(`${gname}: ${String(outcome.summary || (outcome.win ? 'a win' : 'a miss')).slice(0, 110)}`); if (S.hist.length > 10) S.hist.shift();
    const st = S.stats.streak, milestone = !lottery && Math.abs(st) >= 3 && (Math.abs(st) === 3 || Math.abs(st) % 3 === 0);
    const broke = !lottery && ((outcome.win && st === 1 && S.hist.length > 3 && S.lastStreakWas <= -3) || (!outcome.win && st === -1 && S.lastStreakWas >= 3));
    S.lastStreakWas = lottery ? S.lastStreakWas : st;
    const pendingResults = S.talkQ.filter((e) => e.task.beat?.type === 'result').length;
    const interesting = outcome.big || milestone || broke || (lottery ? rand() < 0.12 : rand() < 0.5);
    if (interesting && pendingResults < 1) S.talkQ.unshift({ ts: now(), keep: false, task: { kind: 'speak', beat: { type: 'result', game: games.find((g) => g.id === gid) || S.game, outcome: { ...outcome, streak: lottery ? 0 : st } } } });
  }
  const history = () => S.hist.slice(-8);

  // single-stream wrapper (used by the offline simulation test and the stand-in demo)
  function nextTask() { const talk = nextTalkTask(); return talk.kind === 'wait' ? nextGameTask() : talk; }

  return { ingestChat, nextTalkTask, nextGameTask, nextTask, reportResult, history, state: S, digest, parseRequests, setNextGame, touchChat, chatActiveWithin };
}
