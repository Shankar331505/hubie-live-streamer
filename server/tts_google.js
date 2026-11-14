// Google Cloud Text-to-Speech, Chirp 3: HD voices.
// Free allowance: the first 1,000,000 characters per month; after that $30 per million (billed to the cloud project).
// This module counts characters per calendar month (saved on disk, so restarts do not reset it) and refuses to go past a
// limit that we set safely under the free allowance. The caller falls back to the free local voice when it refuses.
import fs from 'node:fs';
import path from 'node:path';

// speaking rate by emotion (Chirp 3 HD accepts 0.25 to 2.0)
const RATE = { sleepy: 0.98, sad: 1.04, thinking: 1.06, smug: 1.08, serious: 1.05, happy: 1.14, amused: 1.12, laugh: 1.14, surprised: 1.18, excited: 1.2 };
export const RATE_TAG = 'r2';   // part of the cache key, so changing the table never replays old audio

export function createGoogleVoice({ apiKey, voice = 'Algieba', languageCode = 'en-GB', monthlyCharLimit = 950000, usageFile, log = () => {} }) {
  const monthKey = () => new Date().toISOString().slice(0, 7);
  const load = () => { try { const u = JSON.parse(fs.readFileSync(usageFile, 'utf8')); return u.month === monthKey() ? u : { month: monthKey(), chars: 0, calls: 0 }; } catch { return { month: monthKey(), chars: 0, calls: 0 }; } };
  let usage = load();
  const save = () => { fs.mkdirSync(path.dirname(usageFile), { recursive: true }); fs.writeFileSync(usageFile, JSON.stringify(usage)); };
  let backoffUntil = 0, chain = Promise.resolve();
  const voiceName = voice.includes('-') ? voice : `${languageCode}-Chirp3-HD-${voice}`;

  async function synthesize(text, { emotion = 'smug' } = {}) {
    if (!apiKey) throw Object.assign(new Error('no Google TTS key'), { code: 'nokey' });
    usage = usage.month === monthKey() ? usage : load();
    if (usage.chars + text.length > monthlyCharLimit) throw Object.assign(new Error(`Google voice monthly character limit reached (${usage.chars}/${monthlyCharLimit})`), { code: 'cap' });
    if (Date.now() < backoffUntil) throw Object.assign(new Error('Google voice is throttled'), { code: 'throttled' });
    const run = async () => {
      const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ input: { text }, voice: { languageCode, name: voiceName }, audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: RATE[emotion] ?? 1.08 } }),
      });
      if (res.status === 429) { backoffUntil = Date.now() + 30000; throw Object.assign(new Error('Google voice rate limit'), { code: 'throttled' }); }
      if (!res.ok) throw new Error(`Google TTS HTTP ${res.status} ${(await res.text()).slice(0, 160).replace(/\s+/g, ' ')}`);
      const j = await res.json();
      if (!j.audioContent) throw new Error('Google TTS returned no audio');
      usage.chars += text.length; usage.calls++; save();
      return Buffer.from(j.audioContent, 'base64');   // already a WAV (LINEAR16 comes with a header)
    };
    chain = chain.then(run, run);
    return chain;
  }
  return { synthesize, usage: () => usage, voiceName, limit: monthlyCharLimit };
}
