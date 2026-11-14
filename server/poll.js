// How chat answers to one of Hubie's questions are recognised and counted.
// A message only counts when it contains one of the fixed answer words of an option: nothing in chat is ever followed as an instruction.
const norm = (t) => ' ' + String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

// options: [{ id, label, words?: [string], re?: RegExp }]. Returns { o, pos, val } or null.
// By default a message must mention exactly one option ("hit or stand" is not an answer); with firstMention the earliest one wins.
export function matchOption(options, text, { firstMention = false } = {}) {
  const t = norm(text), found = [];
  for (const o of options) {
    let pos = -1, val;
    for (const w of o.words || []) { const i = t.indexOf(' ' + w + ' '); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
    if (o.re) { const m = t.match(o.re); if (m && (pos < 0 || m.index < pos)) { pos = m.index; val = m[1] ?? m[0]; } }
    if (pos >= 0) found.push({ o, pos, val });
  }
  if (!found.length) return null;
  if (firstMention) { found.sort((a, b) => a.pos - b.pos); return found[0]; }
  return found.length === 1 ? found[0] : null;
}

// votes: [{ id, val, user }]. The most votes wins; a tie goes to whoever answered first. One vote is enough.
export function tally(votes, options) {
  if (!votes.length) return null;
  const count = new Map(); for (const v of votes) count.set(v.id, (count.get(v.id) || 0) + 1);
  let best = votes[0].id; for (const [id, n] of count) if (n > count.get(best)) best = id;
  const first = votes.find((v) => v.id === best), opt = options.find((o) => o.id === best);
  return { choice: best, by: first.user, val: first.val, label: best === 'num' ? `number ${first.val}` : (opt?.label || best), votes: votes.length };
}
