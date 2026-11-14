import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACKS, pickFallback } from '../server/fallbacks.js';
import { checkOutput } from '../server/safety.js';
import { EMOTIONS, GAZES } from '../server/persona.js';

test('every fallback line passes the output safety check and uses valid emotion/gaze', () => {
  for (const [kind, lines] of Object.entries(FALLBACKS)) for (const l of lines) {
    const filled = l.text.replace(/\{user\}/g, 'Sam').replace(/\{game\}/g, 'Dice').replace(/\{question\}/g, 'should we hit or stand').replace(/\{choice\}/g, 'hit');
    const r = checkOutput(filled);
    assert.ok(r.ok, `${kind}: "${l.text}" -> ${r.reasons}`);
    assert.ok(EMOTIONS.includes(l.emotion), `${kind} emotion ${l.emotion}`);
    assert.ok(GAZES.includes(l.gaze), `${kind} gaze ${l.gaze}`);
  }
});
test('pickFallback avoids recent lines and fills variables', () => {
  const a = pickFallback('chat_reply', [], { user: 'Sam' });
  assert.ok(a.text.includes('Sam') || !a.text.includes('{'));
  const b = pickFallback('chat_reply', [a.text], { user: 'Sam' });
  assert.notEqual(a.text, b.text);
});
