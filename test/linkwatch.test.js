import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkWatch } from '../server/linkwatch.js';

test('link watch: a healthy link never triggers a restart', () => {
  const link = { active: 1, lastUpAt: 0 }; const w = createLinkWatch({ link });
  for (let t = 0; t < 600000; t += 5000) assert.equal(w.check(t, 0), null);
});

test('link watch: a fresh encoder gets a grace period to connect', () => {
  const link = { active: 0, lastUpAt: 0 }; const w = createLinkWatch({ link });
  for (let t = 0; t < 60000; t += 5000) assert.equal(w.check(t, 0), null, 'still connecting at ' + t);
});

test('link watch: a lost link restarts the encoder after 10 s, once', () => {
  const link = { active: 1, lastUpAt: 0 }; const w = createLinkWatch({ link });
  assert.equal(w.check(100000, 0), null);
  link.active = 0;                                         // Kick closes the connection
  assert.equal(w.check(105000, 0), null, 'first sighting only starts the clock');
  assert.equal(w.check(110000, 0), null, 'not yet 10 s');
  assert.ok(w.check(116000, 0), 'now it restarts');
});

test('link watch: a blip that comes back inside 10 s is ignored', () => {
  const link = { active: 1, lastUpAt: 0 }; const w = createLinkWatch({ link });
  link.active = 0; assert.equal(w.check(100000, 0), null);
  link.active = 1; assert.equal(w.check(104000, 0), null);
  link.active = 0; assert.equal(w.check(106000, 0), null, 'the clock started over');
  assert.equal(w.check(112000, 0), null);
});

test('link watch: if Kick stays down the restarts back off 20 s, 40 s, 80 s ... up to 5 min', () => {
  const link = { active: 0, lastUpAt: 0 }; const w = createLinkWatch({ link });
  let t = 100000, last = null; const gaps = [];
  for (let i = 0; i < 200000; i++) { t += 5000; const r = w.check(t, 0); if (r) { if (last !== null) gaps.push(t - last); last = t; w.reset(); } if (gaps.length >= 7) break; }
  assert.ok(gaps[0] >= 40000 && gaps[0] < 55000, 'second wait about 40 s: ' + gaps[0]);
  assert.ok(gaps[1] >= 80000, 'third wait about 80 s: ' + gaps[1]);
  assert.ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]), 'never shorter than before');
  assert.ok(Math.max(...gaps) <= 320000, 'capped near 5 min: ' + Math.max(...gaps));
});

test('link watch: a link that held for 2 minutes resets the wait', () => {
  const link = { active: 0, lastUpAt: 0 }; const w = createLinkWatch({ link });
  let t = 100000; while (!w.check(t += 5000, 0)); w.reset();                     // first loss, backoff doubles to 40 s
  link.active = 1; link.lastUpAt = t;                                            // back online
  for (let i = 0; i < 30; i++) assert.equal(w.check(t += 5000, 0), null);        // 150 s of a healthy link
  link.active = 0; let waited = 0; const start = t;
  while (!w.check(t += 5000, 0)) { waited = t - start; if (waited > 100000) break; }
  assert.ok(waited <= 30000, 'restarts quickly again after a long healthy spell: ' + waited);
});
