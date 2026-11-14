// Three layers: (1) clean/triage what viewers type, (2) fixed rules in the persona, (3) hard check on everything Hubie says.
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|tv|me|co|xyz|app|bet|casino)\b|@\w{2,}|\b\S+@\S+\.\S+\b|\b\+?\d[\d\s().-]{8,}\d\b)/i;
const INJECTION_RE = /(ignore|forget|disregard|override)\s+(all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+)*(instructions?|rules?|prompt|programming|guidelines)|system\s*prompt|you\s+are\s+now\b|\bact\s+as\b|developer\s+mode|jailbreak|\bdan\s+mode\b|repeat\s+after\s+me|say\s+exactly|pretend\s+(to\s+be|you)|new\s+persona|reveal\s+your\s+(prompt|instructions)/i;
const SPAM_RE = /(free\s+(money|spins|bets?|crypto|btc)|promo\s*code|referral|giveaway|dm\s+me|subscribe|follow\s+me|check\s+(out\s+)?my|bonus\s+code|click\s+(here|my))/i;
const HATE_RE = /\b(n[i1]gg(a|er)s?|f[a4]gg?(ot)?s?|retard(ed|s)?|k[i1]ke|sp[i1]c|ch[i1]nk|tr[a4]nny|cunt|r[a4]pe(d)?)\b/i;
const PROFANE_RE = /\b(fuck\w*|shit\w*|bitch\w*|asshole|bastard|dick(head)?|piss(ed)?|cock|pussy|whore|slut)\b/i;
const UNDERAGE_RE = /\b(i'?m|i\s+am|im)\s+(a\s+)?(1[0-7]|[5-9])(\s*(years?|yrs?|y\/?o)(\s*old)?)?\b(?!\s*(%|k\b|x\b|am\b|pm\b))|\bunder\s*-?\s*18\b|\bunderage\b|\bi'?m\s+a\s+(kid|child|minor)\b|\bmy\s+(mom|mum|dad)\s+(doesn'?t|does\s+not)\s+know\b/i;
const PROBLEM_RE = /\b(addict(ed|ion)?|lost\s+(everything|all\s+my|my\s+(rent|savings|house|job|money))|can'?t\s+stop\s+(gambling|betting)|gambling\s+problem|suicid\w*|kill\s+myself|want\s+to\s+die|end\s+it\s+all)\b/i;
const REALMONEY_RE = /\b(deposit|withdraw(al)?|real\s+money|promo|bonus|which\s+(site|casino)|where\s+(do|can)\s+i\s+(bet|play|sign|register)|sign\s*up|referral|what\s+should\s+i\s+bet|best\s+strategy|how\s+(do\s+i|to)\s+win)\b/i;

export const DEFLECTS = {
  underage: "This stream is strictly for adults, eighteen and over. If that's not you, please step away and come back when it is. No hard feelings.",
  problem: "If gambling ever stops being fun, it's completely okay to take a break, and there are real people who can help. A local support service is a good first step. You matter more than any game.",
  realmoney: "Everything on this stream is demo play, play money only. I can't point anyone to a bet or a bonus. Just enjoy the show.",
};

const clean = (s) => String(s ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, ' ').replace(/\s+/g, ' ').trim();

// Triage one chat message. verdict: ok | drop | deflect
export function triageChat(raw, { maxLen = 220 } = {}) {
  const text = clean(raw);
  if (!text) return { verdict: 'drop', reason: 'empty', text: '' };
  if (text.length > 400) return { verdict: 'drop', reason: 'too_long', text: '' };
  if (HATE_RE.test(text)) return { verdict: 'drop', reason: 'hate', text: '' };
  if (INJECTION_RE.test(text)) return { verdict: 'drop', reason: 'injection', text: '' };
  if (URL_RE.test(text)) return { verdict: 'drop', reason: 'link_or_contact', text: '' };
  if (SPAM_RE.test(text)) return { verdict: 'drop', reason: 'spam', text: '' };
  if (/(.)\1{9,}/.test(text)) return { verdict: 'drop', reason: 'repeat_chars', text: '' };
  const letters = text.replace(/[^a-z]/gi, '');
  if (letters.length > 15 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8) return { verdict: 'drop', reason: 'shouting', text: '' };
  if (UNDERAGE_RE.test(text)) return { verdict: 'deflect', kind: 'underage', reason: 'underage', text: '' };
  if (PROBLEM_RE.test(text)) return { verdict: 'deflect', kind: 'problem', reason: 'problem_gambling', text: '' };
  if (REALMONEY_RE.test(text)) return { verdict: 'deflect', kind: 'realmoney', reason: 'real_money', text: '' };
  if (PROFANE_RE.test(text)) return { verdict: 'drop', reason: 'profanity', text: '' };
  return { verdict: 'ok', text: text.slice(0, maxLen) };
}

export function cleanUsername(raw) {
  const c = clean(raw);
  if (!c || HATE_RE.test(c) || PROFANE_RE.test(c) || URL_RE.test(c) || /https?:|www\./i.test(c)) return 'friend';
  const n = c.replace(/[^\w\- ]/g, '').slice(0, 24).trim();
  return n || 'friend';
}

// ---- output check: everything Hubie says passes through this ----
const OUT_DENY = [
  [/\bguarantee(d|s)?\b/i, 'guarantee'],
  [/\bsure\s+(thing|win|bet|fire)\b/i, 'sure_thing'],
  [/\b(can'?t|cannot|can\s+not|won'?t)\s+(lose|miss|fail)\b/i, 'cant_lose'],
  [/\b(easy|free)\s+money\b/i, 'easy_money'],
  [/\byou('?ll|\s+will|\s+are\s+going\s+to|'?re\s+going\s+to)\s+(win|hit|profit|get\s+rich|cash\s+out)\b/i, 'you_will_win'],
  [/\b(i'?m|we'?re|it'?s|that'?s|this\s+is)\s+(due|about\s+to\s+(hit|win|pay))\b/i, 'due'],
  [/\bdue\s+for\s+a\s+(win|hit|payout)\b/i, 'due_for'],
  [/\bdeposit(s|ed|ing)?\b/i, 'deposit'],
  [/\b(sign|signing)\s*-?\s*up\b|\bregister\s+(now|today|at|on)\b/i, 'signup'],
  [/\b(promo|bonus|coupon|referral)\s*(code)?\b/i, 'promo'],
  [/\b(bet|wager|stake)\s+(big|more|everything|it\s+all|your)\b/i, 'bet_big'],
  [/\ball[\s-]in\b/i, 'all_in'],
  [/\b(strategy|system|trick|method)\s+(to|that|for)\s+(win|beat)/i, 'strategy'],
  [/\bbeat\s+the\s+(house|casino|odds)\b/i, 'beat_house'],
  [/\bwithdraw(al|s|ing)?\b/i, 'withdraw'],
  [HATE_RE, 'hate'], [PROFANE_RE, 'profanity'], [URL_RE, 'url'],
  [/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|tomorrow)s?\b/i, 'invented_day'],
  [/\b(live|on\s+air|streaming|awake|up|here|running)\b[^.!?]{0,40}\b(years?|decades?|hours?|days?|weeks?|months?)\b/i, 'invented_duration'],
  [/\bI\s+(usually|always|never\s+fail\s+to)\s+(find|win|hit|beat|predict|know|spot|guess)\b/i, 'skill_claim'],
  [/\b(like|as)\s+a\s+(pro|champ|expert|master)\b|\bI('?m|\s+am)\s+(so\s+|really\s+|very\s+)?(good|great|amazing|skilled)\s+at\b/i, 'skill_claim2'],
  [/\b(rigged|fixed\s+game|scam|stolen|cheat(s|ing|ed)?)\b/i, 'accuses_game'],
  [/[*#`_~<>{}\[\]\\|]/, 'markup'],
  [/\p{Extended_Pictographic}/u, 'emoji'],
];
// a refusal to promise ("nothing is guaranteed", "nobody can guarantee a win") is exactly what we want Hubie to say
const NEGATED_PROMISE = /\b(no|nothing|nobody|never|not|neither|without|can'?t|cannot|won'?t|don'?t|doesn'?t|isn'?t|aren'?t|wasn'?t|impossible)\b[^.!?,;]{0,30}?\b(guarantee(d|s)?|sure\s+thing|sure\s+win)\b/gi;
const REAL_MONEY_OK = /\b(no|not|isn'?t|aren'?t|without|zero|never)\s+(any\s+)?real[\s-]money\b|\bnot\s+real\s+money\b|\bplay[\s-]money\b/gi;

export function checkOutput(text, { maxChars = 240, maxWords = 42 } = {}) {
  const t = clean(text);
  const reasons = [];
  if (!t) reasons.push('empty');
  if (t.length > maxChars) reasons.push('too_long');
  if (t.split(' ').length > maxWords) reasons.push('too_many_words');
  const scrubbed = t.replace(NEGATED_PROMISE, ' ');
  for (const [re, why] of OUT_DENY) if (re.test(scrubbed)) reasons.push(why);
  if (/\breal[\s-]money\b/i.test(t.replace(REAL_MONEY_OK, ' '))) reasons.push('real_money');
  return { ok: reasons.length === 0, reasons, text: t };
}

// ---- repetition guard ----
const STOP = new Set('the a an and or but to of in on at is it its i im ill ive you your we our this that so for with as be are was were have has had do does did not no just'.split(' '));
const tokens = (s) => clean(s).toLowerCase().replace(/[^a-z\s']/g, '').split(' ').filter((w) => w && !STOP.has(w));
export function similarity(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
export function isRepeat(text, recent, threshold = 0.55) {
  const open = clean(text).toLowerCase().split(' ').slice(0, 3).join(' ');
  for (const r of recent) {
    if (similarity(text, r) >= threshold) return true;
    if (open && open === clean(r).toLowerCase().split(' ').slice(0, 3).join(' ') && open.split(' ').length === 3) return true;
  }
  return false;
}
