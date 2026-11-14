// Audio: decode speech files to PCM, and a real-time mixer that feeds the encoder one steady audio stream.
import { spawn } from 'node:child_process';

export const SR = 48000, CH = 2, BPF = 4; // 48 kHz, stereo, s16le => 4 bytes per frame

export function decodeToPCM(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 's16le', '-ar', String(SR), '-ac', String(CH), 'pipe:1']);
    const parts = []; p.stdout.on('data', (d) => parts.push(d));
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? resolve(Buffer.concat(parts)) : reject(new Error('ffmpeg decode exited ' + c))));
  });
}
// bring any voice to the same loudness: scale so the peak sits at `target` of full scale (never more than 6x, never down)
export function normalizePCM(pcm, target = 0.85) {
  let peak = 0; for (let i = 0; i + 1 < pcm.length; i += 2) { const v = Math.abs(pcm.readInt16LE(i)); if (v > peak) peak = v; }
  if (!peak) return pcm;
  const gain = Math.min(6, (target * 32767) / peak); if (gain < 1.02) return pcm;
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * gain))), i);
  return out;
}
export const pcmSeconds = (pcm) => pcm.length / (SR * BPF);
export function monoFloat(pcm) {
  const n = Math.floor(pcm.length / BPF), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (pcm.readInt16LE(i * BPF) + pcm.readInt16LE(i * BPF + 2)) / 65536;
  return out;
}

// Writes silence continuously and mixes speech in at an exact wall-clock moment.
export class Mixer {
  constructor(write) {
    this.write = write; this.voices = []; this.timer = null; this.sent = 0; this.t0 = 0; this.gain = 0.9;
    // "bed": a continuous live source (the game's own sound). It is queued, resampled to 48 kHz, delayed a little so it lines up
    // with the video (which reaches the encoder a few hundred ms after it happens), and turned down while Hubie speaks.
    this.bed = []; this.bedFrames = 0; this.bedPrimed = false; this.bedPhase = 0; this.bedLast = [0, 0];
    this.lead = Number(process.env.MIXER_LEAD_MS || 80) / 1000; this.bedGain = Number(process.env.GAME_SOUND_GAIN || 1.3); this.bedDuck = 0.28; this.bedLevel = 1;
    this.bedDelayFrames = Math.round(Number(process.env.GAME_SOUND_DELAY_MS || 200) / 1000 * SR);
  }
  // i16: interleaved stereo Int16 at `rate` Hz
  feedBed(i16, rate = SR) {
    const step = rate / SR, nIn = i16.length >> 1; if (!nIn) return;
    const out = []; let pos = this.bedPhase;
    // linear resample; bedLast carries the previous chunk's final frame so there is no click at the seams
    const at = (k, c) => (k < 0 ? this.bedLast[c] : i16[k * 2 + c]);
    while (pos < nIn - 1) { const k = Math.floor(pos), f = pos - k; for (let c = 0; c < 2; c++) out.push(Math.round(at(k, c) * (1 - f) + at(k + 1, c) * f)); pos += step; }
    this.bedPhase = pos - nIn; this.bedLast = [i16[(nIn - 1) * 2], i16[(nIn - 1) * 2 + 1]];
    const a = Int16Array.from(out); this.bed.push(a); this.bedFrames += a.length >> 1;
    // keep the backlog close to the delay we want: if bursts or clock drift let it grow past +450 ms, drop the oldest sound
    // (a tiny skip) so the game sound never falls behind the picture
    if (this.bedFrames > this.bedDelayFrames + Math.round(0.45 * SR)) {
      let drop = this.bedFrames - (this.bedDelayFrames + Math.round(0.06 * SR));
      while (drop > 0 && this.bed.length) { const h = this.bed[0], hf = h.length >> 1; if (hf <= drop) { this.bed.shift(); drop -= hf; this.bedFrames -= hf; } else { this.bed[0] = h.subarray(drop * 2); this.bedFrames -= drop; drop = 0; } }
      this.bedTrims = (this.bedTrims || 0) + 1;
    }
  }
  // Takes n frames for the next 20 ms. The page's audio clock and this mixer's clock never run at exactly the same speed, so a fixed read rate
  // lets the queue slowly fill (the game sound lags the picture more and more) or run dry. Instead the queue is read up to 3% faster when it
  // is above its target level and slower when below, which holds the delay steady without dropping any sound.
  pullBed(n) {
    if (!this.bedPrimed) { if (this.bedFrames < this.bedDelayFrames + n) return null; this.bedPrimed = true; }
    const target = this.bedDelayFrames + n;
    const err = (this.bedFrames - target) / SR;                                   // seconds above the target level
    const rate = 1 + Math.max(-0.03, Math.min(0.03, err * 0.15));
    const need = Math.max(1, Math.round(n * rate));
    if (this.bedFrames < need) { this.bedPrimed = false; return null; }          // ran dry: wait until it has refilled
    const tmp = new Int16Array(need * 2); let got = 0;
    while (got < need) {
      const head = this.bed[0], have = head.length >> 1, take = Math.min(need - got, have);
      tmp.set(head.subarray(0, take * 2), got * 2); got += take;
      if (take === have) this.bed.shift(); else this.bed[0] = head.subarray(take * 2);
    }
    this.bedFrames -= need;
    if (need === n) return tmp;
    const out = new Int16Array(n * 2), step = (need - 1) / Math.max(1, n - 1);    // linear re-sample need -> n frames
    for (let i = 0; i < n; i++) {
      const pos = i * step, k = Math.floor(pos), f = pos - k, k2 = Math.min(need - 1, k + 1);
      for (let c = 0; c < 2; c++) out[i * 2 + c] = Math.round(tmp[k * 2 + c] * (1 - f) + tmp[k2 * 2 + c] * f);
    }
    return out;
  }
  start() {
    this.t0 = Date.now(); this.sent = 0;
    this.timer = setInterval(() => this.pump(), 10);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  // play a PCM buffer starting at wall-clock `startAtMs`
  play(pcm, startAtMs = Date.now()) {
    const startFrame = Math.max(this.sent, Math.round(((startAtMs - this.t0) / 1000) * SR));
    this.voices.push({ pcm, startFrame, pos: 0 });
  }
  pump() {
    const target = ((Date.now() - this.t0) / 1000 + this.lead) * SR; // stay a little ahead of real time
    const CHUNK = 960; // 20 ms
    while (this.sent < target) {
      const buf = Buffer.alloc(CHUNK * BPF);
      const talking = this.voices.some((v) => this.sent + CHUNK > v.startFrame && v.pos < v.pcm.length);
      this.bedLevel += ((talking ? this.bedDuck : 1) - this.bedLevel) * 0.12;      // glide down when Hubie talks, back up when he stops
      const bed = this.pullBed(CHUNK);
      if (bed) for (let i = 0; i < bed.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(bed[i] * this.bedGain * this.bedLevel))), i * 2);
      for (const v of this.voices) {
        if (this.sent + CHUNK <= v.startFrame) continue;
        const off = Math.max(0, v.startFrame - this.sent);            // frames of silence before the voice starts in this chunk
        const have = Math.floor((v.pcm.length - v.pos) / BPF);
        const n = Math.min(CHUNK - off, have);
        for (let i = 0; i < n * CH; i++) {
          const o = (off * CH + i) * 2, cur = buf.readInt16LE(o);
          const add = Math.round(v.pcm.readInt16LE(v.pos + i * 2) * this.gain);
          buf.writeInt16LE(Math.max(-32768, Math.min(32767, cur + add)), o);
        }
        v.pos += n * BPF;
      }
      this.voices = this.voices.filter((v) => v.pos < v.pcm.length);
      try { this.write(buf); } catch { /* encoder gone */ }
      this.sent += CHUNK;
    }
  }
}
