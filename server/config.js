// Loads .env (never logged) and exposes typed settings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...parseEnv(path.join(ROOT, '.env')), ...process.env };
export const config = {
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || '',            // set to force ONE model for everything
  geminiFastModel: env.GEMINI_FAST_MODEL || 'gemini-3.1-flash-lite',   // quick reactions: results, predictions, banter
  geminiSmartModel: env.GEMINI_SMART_MODEL || 'gemini-3.5-flash',      // opening, replies to viewers, chat summaries
  googleTtsKey: env.GOOGLE_TTS_API_KEY || '',
  googleVoice: env.GOOGLE_TTS_VOICE || 'Puck',
  googleLang: env.GOOGLE_TTS_LANG || 'en-GB',
  googleMonthlyChars: Number(env.GOOGLE_TTS_MONTHLY_CHARS || 1150000),  // 1,000,000 are free; the last 150,000 would cost at most $4.50 from the cloud credit; after that Kokoro (free) takes over
  // google (Chirp 3 HD, free allowance, falls back to Kokoro) | kokoro (free, local) | elevenlabs (paid). Default: google when a key is set.
  ttsProvider: env.TTS_PROVIDER || (env.GOOGLE_TTS_API_KEY ? 'google' : 'kokoro'),
  kokoroVoice: env.KOKORO_VOICE || 'bm_george',
  kokoroSpeed: Number(env.KOKORO_SPEED || 0.95),
  elevenKey: env.ELEVENLABS_API_KEY || '',
  elevenVoice: env.ELEVENLABS_VOICE_ID || 'wiF43F1vngB3iRFsbWhJ',
  elevenModel: env.ELEVENLABS_MODEL || 'eleven_v4',
  kickChannel: env.KICK_CHANNEL || '',
  kickChatroom: env.KICK_CHATROOM_ID || '',
  kickRtmp: env.KICK_RTMP_URL || '',
  kickKey: env.KICK_STREAM_KEY || '',
  // budgets: a run that dies from a spent budget resets the "no human" clock, so these are guard rails, not targets
  maxBrainCallsPerHour: Number(env.MAX_BRAIN_CALLS_PER_HOUR || 900),
  maxSpeechCharsPerHour: Number(env.MAX_SPEECH_CHARS_PER_HOUR || 9000),
};
export const hasGemini = () => !!config.geminiKey;
