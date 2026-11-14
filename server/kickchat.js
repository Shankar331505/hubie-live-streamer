// Reads a Kick channel's live chat (read-only, anonymous, like any viewer's browser).
// Kick's page asks web.kick.com for a connection address and a short-lived token, then connects to a Centrifugo
// real-time service and subscribes to the chatroom channel. This does the same and reconnects on its own.
// Every message goes through the director's safety triage before anything is shown or answered.
import crypto from 'node:crypto';
import WebSocket from 'ws';

const API = 'https://web.kick.com/api/v1';
const H = { Origin: 'https://kick.com', Referer: 'https://kick.com/', 'Content-Type': 'application/json', 'x-app-platform': 'web' };

export function createKickChat({ chatroomId, onMessage, log = () => {} }) {
  let ws = null, stopped = false, retry = 0, refreshTimer = null, pingWatch = null, lastFrame = 0;
  const state = { connected: false, subscribed: false, messages: 0, lastMessageAt: 0, reconnects: 0 };

  // Kick emotes arrive as [emote:123:NAME]; keep just a readable name
  const clean = (s) => String(s || '').replace(/\[emote:\d+:([^\]]+)\]/g, ' $1 ').replace(/\s+/g, ' ').trim();

  async function credentials() {
    const id = crypto.randomUUID();
    const caps = { client: { id, type: 'web' }, capabilities: { accepted_providers: [{ provider: 'pusher' }, { provider: 'centrifugo' }] } };
    const r1 = await fetch(`${API}/realtime/connection`, { method: 'POST', headers: H, body: JSON.stringify(caps), signal: AbortSignal.timeout(15000) });
    if (!r1.ok) throw new Error('connection address HTTP ' + r1.status);
    const conn = (await r1.json()).data?.connections?.find((c) => c.provider === 'centrifugo');
    if (!conn) throw new Error('no centrifugo connection offered');
    const r2 = await fetch(`${API}/realtime/auth/connection`, { method: 'POST', headers: H, body: JSON.stringify({ client_id: id }), signal: AbortSignal.timeout(15000) });
    if (!r2.ok) throw new Error('token HTTP ' + r2.status);
    return { url: conn.credentials.url, token: (await r2.json()).data?.token };
  }

  async function connect() {
    if (stopped) return;
    let cred;
    try { cred = await credentials(); } catch (e) { return fail('credentials: ' + e.message); }
    ws = new WebSocket(cred.url, { headers: { Origin: 'https://kick.com', 'User-Agent': 'Mozilla/5.0' } });
    ws.on('open', () => { ws.send(JSON.stringify({ connect: { token: cred.token, name: 'js' }, id: 1 })); });
    ws.on('message', (raw) => {
      lastFrame = Date.now();
      for (const line of String(raw).split('\n')) {
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (Object.keys(m).length === 0) { ws.send('{}'); continue; }                   // server ping -> pong
        if (m.id === 1 && m.connect) {
          retry = 0; state.connected = true; log('kick chat: connected');
          ws.send(JSON.stringify({ subscribe: { channel: `chatrooms.${chatroomId}.v2`, flag: 1 }, id: 2 }));
          const ttl = (m.connect.ttl || 2400) * 1000; clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => { log('kick chat: refreshing the connection before the token expires'); state.reconnects++; try { ws.close(); } catch {} }, Math.max(60000, ttl - 120000));
        } else if (m.id === 2 && m.subscribe) { state.subscribed = true; log(`kick chat: listening to chatroom ${chatroomId}`); }
        else if (m.error) { log('kick chat: server error ' + JSON.stringify(m.error)); }
        else if (m.push?.pub) {
          try {
            let d = m.push.pub.data; if (typeof d === 'string') d = JSON.parse(d);
            if (/ChatMessageEvent$/.test(d.event || '')) {
              const p = typeof d.data === 'string' ? JSON.parse(d.data) : d.data;
              const text = clean(p.content), user = p.sender?.username || 'viewer';
              if (!text) continue;
              state.messages++; state.lastMessageAt = Date.now();
              onMessage({ user, text, id: p.id, ts: Date.now() });
            }
          } catch (e) { log('kick chat: could not read a message: ' + e.message); }
        }
      }
    });
    ws.on('close', () => { state.connected = false; state.subscribed = false; clearTimeout(refreshTimer); if (!stopped) fail('disconnected'); });
    ws.on('error', (e) => log('kick chat error: ' + e.message));
  }
  function fail(why) { const wait = Math.min(30000, 1000 * 2 ** retry++); log(`kick chat: ${why}, retrying in ${wait / 1000}s`); setTimeout(connect, wait); }

  connect();
  // watchdog: if nothing at all (not even pings) arrives for a minute the link is dead; reconnect
  pingWatch = setInterval(() => { if (state.connected && Date.now() - lastFrame > 70000) { log('kick chat: link went silent, reconnecting'); state.reconnects++; try { ws.terminate(); } catch {} } }, 15000);
  return { state, stop() { stopped = true; clearInterval(pingWatch); clearTimeout(refreshTimer); try { ws?.close(); } catch {} } };
}
