import test from 'node:test';
import assert from 'node:assert/strict';
import { Mixer } from '../server/audio.js';

// a steady 440 Hz tone, interleaved stereo, at the given rate
const tone = (rate, seconds, amp = 8000) => { const n = Math.round(rate * seconds), a = new Int16Array(n * 2); for (let i = 0; i < n; i++) a[i * 2] = a[i * 2 + 1] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * amp); return a; };

test('game sound: 44.1 kHz input is resampled to 48 kHz with the right length', () => {
  const m = new Mixer(() => {}); m.bedDelayFrames = 96000;   // large, so nothing is trimmed in this length check
  for (let i = 0; i < 10; i++) m.feedBed(tone(44100, 0.1).subarray(0, 8820), 44100);   // 10 x 0.1 s
  const got = m.bedFrames / 48000;
  assert.ok(Math.abs(got - 1.0) < 0.01, 'expected about 1 s, got ' + got);
});

test('game sound: nothing plays until the delay has built up, and it never grows without bound', () => {
  const m = new Mixer(() => {}); m.bedDelayFrames = 4800;       // 100 ms
  m.feedBed(tone(48000, 0.05), 48000);
  assert.equal(m.pullBed(960), null, 'must wait for the delay');
  m.feedBed(tone(48000, 0.2), 48000);
  assert.ok(m.pullBed(960), 'plays once primed');
  for (let i = 0; i < 100; i++) m.feedBed(tone(48000, 0.1), 48000);
  assert.ok(m.bedFrames <= m.bedDelayFrames + 21600 + 4800, 'bounded: ' + m.bedFrames);
});

test('game sound: is turned down while a voice speaks', () => {
  const out = []; const m = new Mixer((b) => out.push(Buffer.from(b)));
  m.bedDelayFrames = 0; m.t0 = Date.now(); m.sent = 0;
  const feed = () => m.feedBed(tone(48000, 0.1), 48000);      // a steady supply: 0.1 s of sound for every 0.1 s that passes
  feed(); m.bedLevel = 1; m.t0 -= 100; m.pump();
  const peak = (bufs) => Math.max(...bufs.flatMap((b) => Array.from({ length: 960 }, (_, i) => Math.abs(b.readInt16LE(i * 4)))));
  const loud = peak(out.slice());
  m.voices.push({ pcm: Buffer.alloc(48000 * 4 * 5), startFrame: 0, pos: 0 });
  for (let i = 0; i < 12; i++) { feed(); m.t0 -= 100; m.pump(); }        // about a second of speech
  const quiet = peak(out.slice(-3));
  assert.ok(quiet < loud * 0.6, `ducked: ${quiet} vs ${loud}`);
});

test('game sound: a source clock that runs slightly fast or slow keeps a steady delay, with no dropped sound', () => {
  for (const ppm of [+5000, -5000]) {                                    // the page's clock 0.5% faster, then 0.5% slower, than the mixer's
    const m = new Mixer(() => {}); m.bedDelayFrames = 9600;              // 200 ms target
    for (let i = 0; i < 11; i++) m.feedBed(tone(48000, 0.02), 48000);    // start with about the target amount queued
    let worst = 0;
    for (let i = 0; i < 3000; i++) {                                     // 60 s of 20 ms steps
      const n = Math.round(960 * (1 + ppm / 1e6));
      m.feedBed(tone(48000, n / 48000), 48000); m.pullBed(960);
      if (i > 500) worst = Math.max(worst, Math.abs(m.bedFrames - (m.bedDelayFrames + 960)) / 48000);
    }
    assert.ok(worst < 0.15, `delay stayed within 150 ms of its target (off by ${worst.toFixed(3)} s at ${ppm} ppm)`);
    assert.ok(!m.bedTrims, 'nothing was cut');
  }
});
