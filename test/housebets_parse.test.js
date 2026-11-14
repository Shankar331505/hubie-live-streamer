import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECS } from '../server/housebets_driver.js';

// payloads captured from the real games (zero stake)
test('dice: win when the roll is over the target, multiplier from win chance', () => {
  const r = SPECS.dice.parse({ game: { outcome: 61.42, rollOver: 50.5, betDirection: 'over', mode: 'over', winChance: 49.5, payoutMultiplier: 2 } });
  assert.equal(r.win, true); assert.equal(r.multiplier, 2);
  const m = SPECS.dice.parse({ game: { outcome: 28.9, rollOver: 34.94, mode: 'over', winChance: 65.06, payoutMultiplier: 0 } });
  assert.equal(m.win, false); assert.equal(m.multiplier, 0);
  const z = SPECS.dice.parse({ game: { outcome: 63.09, rollOver: 55.51, mode: 'over', winChance: 44.49, payoutMultiplier: 0 } });
  assert.equal(z.win, true); assert.equal(z.multiplier, 2.23);   // 99 / 44.49 = 2.2252
});
test('dice: under mode', () => {
  assert.equal(SPECS.dice.parse({ game: { outcome: 20, rollOver: 40, mode: 'under', winChance: 40 } }).win, true);
});
test('limbo: win when the draw reaches the target', () => {
  assert.equal(SPECS.limbo.parse({ game: { betNumber: 2, outcome: 2.56, winChance: 49.5 } }).win, true);
  assert.equal(SPECS.limbo.parse({ game: { betNumber: 5, outcome: 1.3, winChance: 19.8 } }).win, false);
});
test('wheel: zero multiplier is a bust, 1x or more is a win', () => {
  assert.equal(SPECS.wheel.parse({ game: { multiplier: 0, risk: 'medium', segments: 30, segment: 28 } }).win, false);
  const w = SPECS.wheel.parse({ game: { multiplier: 3, risk: 'high', segments: 30, segment: 4 } }); assert.equal(w.win, true); assert.equal(w.multiplier, 3);
});
test('plinko: bucket multiplier below 1 is a miss', () => {
  assert.equal(SPECS.plinko.parse({ game: { multiplier: 0.25, bucket: 6, rows: 12, risk: 'medium' } }).win, false);
  assert.equal(SPECS.plinko.parse({ game: { multiplier: 5.21, bucket: 2, rows: 12, risk: 'medium' } }).win, true);
});
test('coin flip: matched call wins', () => {
  assert.equal(SPECS['coin-flip'].parse({ game: { calls: 'H', flips: 'T', matched: 0, target: 1 } }).win, false);
  assert.equal(SPECS['coin-flip'].parse({ game: { calls: 'T', flips: 'T', matched: 1, target: 1 } }).win, true);
});
test('max win: only a draw at the target is a jackpot', () => {
  assert.equal(SPECS['max-win'].parse({ game: { betNumber: 1000, outcome: 2.67, winChance: 0.099 } }).win, false);
  assert.equal(SPECS['max-win'].parse({ game: { betNumber: 1000, outcome: 1200, winChance: 0.099 } }).big, true);
});
