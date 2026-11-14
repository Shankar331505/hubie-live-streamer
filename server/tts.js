// Text to speech. ElevenLabs (with per-letter timestamps) in production; macOS `say` for free local tests.
// Every generated line is cached on disk, so repeated lines (and replays) cost nothing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT } from './config.js';

// speaking pace by emotion (Kokoro has no emotion control, but pace carries a lot of it)
const PACE = { sleepy: 0.84, sad: 0.9, thinking: 0.92, smug: 0.95, serious: 0.95, happy: 1.0, amused: 1.0, laugh: 1.0, surprised: 1.05, excited: 1.08 };

// 16-bit mono WAV from float samples
function wavBuffer(samples, rate) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

export function createTTS({ provider = 'elevenlabs', googleVoice = null, kokoroVoice = 'bm_george', kokoroSpeed = 0.95, apiKey = '', voiceId, model, mock = false, maxCharsPerHour = 9000, cacheDir = path.join(ROOT, 'cache', 'tts'), log = () => {} } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const spent = []; // [timestamp, chars]
  const stats = { calls: 0, cached: 0, chars: 0, refused: 0, errors: 0 };
  let kokoro = null, kokoroChain = Promise.resolve();
  async function loadKokoro() {
    if (kokoro) return kokoro;
    const { KokoroTTS } = await import('kokoro-js');
    log('loading the Kokoro voice model…');
    kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
    log('Kokoro ready');
    return kokoro;
  }
  function viaKokoro(text, key, emotion) {
    const run = async () => {
      const k = await loadKokoro();
      const speed = Math.round(kokoroSpeed * (PACE[emotion] || 0.95) / 0.95 * 100) / 100;
      const a = await k.generate(text, { voice: kokoroVoice, speed });
      const file = path.join(cacheDir, key + '.wav');
      fs.writeFileSync(file, wavBuffer(a.audio, a.sampling_rate));
      return { file, alignment: null };
    };
    kokoroChain = kokoroChain.then(run, run);     // one line at a time through the model
    return kokoroChain;
  }
  const charsLastHour = () => { const cut = Date.now() - 3600_000; while (spent.length && spent[0][0] < cut) spent.shift(); return spent.reduce((a, s) => a + s[1], 0); };

  async function viaEleven(text, key) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model }), signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const j = await res.json();
    const a = j.alignment || j.normalized_alignment;
    fs.writeFileSync(path.join(cacheDir, key + '.mp3'), Buffer.from(j.audio_base64, 'base64'));
    fs.writeFileSync(path.join(cacheDir, key + '.json'), JSON.stringify({ chars: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds }));
    return { file: path.join(cacheDir, key + '.mp3'), alignment: JSON.parse(fs.readFileSync(path.join(cacheDir, key + '.json'), 'utf8')) };
  }
  function viaSay(text, key) {
    const out = path.join(cacheDir, key + '.aiff');
    return new Promise((resolve, reject) => {
      const p = spawn('say', ['-v', 'Daniel', '-r', '170', '-o', out, text]);
      p.on('error', reject); p.on('exit', (c) => (c === 0 ? resolve({ file: out, alignment: null }) : reject(new Error('say exited ' + c))));
    });
  }

  // returns { file, alignment|null, cached } or null when over budget / failed (caller shows captions only)
  // the free local voice, used directly or as the safety net behind the Google voice
  async function synthKokoro(text, emotion) {
    const key = crypto.createHash('sha1').update(['kokoro', kokoroVoice, kokoroSpeed, emotion, text].join('|')).digest('hex').slice(0, 24);
    const f = path.join(cacheDir, key + '.wav');
    if (fs.existsSync(f)) { stats.cached++; return { file: f, alignment: null, cached: true }; }
    try { stats.calls++; const r = await viaKokoro(text, key, emotion); return { ...r, cached: false }; }
    catch (e) { stats.errors++; log('tts error: ' + e.message); return null; }
  }
  async function synth(text, { emotion = 'smug' } = {}) {
    if (provider === 'google' && googleVoice && !mock) {
      const gkey = crypto.createHash('sha1').update(['google', 'r2', googleVoice.voiceName, emotion, text].join('|')).digest('hex').slice(0, 24);
      const gf = path.join(cacheDir, gkey + '.wav');
      if (fs.existsSync(gf)) { stats.cached++; return { file: gf, alignment: null, cached: true }; }
      try { stats.calls++; stats.chars += text.length; fs.writeFileSync(gf, await googleVoice.synthesize(text, { emotion })); return { file: gf, alignment: null, cached: false }; }
      catch (e) { stats.fallbacks = (stats.fallbacks || 0) + 1; log('tts: ' + e.message + ' -> using the free voice for this line'); return synthKokoro(text, emotion); }
    }
    const useKokoro = provider === 'kokoro' && !mock;
    const key = crypto.createHash('sha1').update(useKokoro ? ['kokoro', kokoroVoice, kokoroSpeed, emotion, text].join('|') : [mock ? 'say' : model, voiceId, text].join('|')).digest('hex').slice(0, 24);
    const ext = useKokoro ? '.wav' : mock ? '.aiff' : '.mp3';
    const f = path.join(cacheDir, key + ext);
    if (fs.existsSync(f)) {
      stats.cached++;
      const jf = path.join(cacheDir, key + '.json');
      return { file: f, alignment: !mock && !useKokoro && fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : null, cached: true };
    }
    if (!mock && !useKokoro && charsLastHour() + text.length > maxCharsPerHour) { stats.refused++; log('tts: hourly character budget reached, skipping speech'); return null; }
    try {
      stats.calls++; stats.chars += text.length; spent.push([Date.now(), text.length]);
      const r = useKokoro ? await viaKokoro(text, key, emotion) : mock ? await viaSay(text, key) : await viaEleven(text, key);
      return { ...r, cached: false };
    } catch (e) { stats.errors++; log('tts error: ' + e.message); return null; }
  }
  return { synth, stats, charsLastHour, googleVoice, warmup: () => ((provider === 'kokoro' || provider === 'google') && !mock ? loadKokoro() : Promise.resolve()) };
}
