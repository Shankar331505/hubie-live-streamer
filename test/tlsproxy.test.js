import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startTlsProxy } from '../server/tlsproxy.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('relay: counts live links to Kick, and notices when Kick closes one', async () => {
  const kick = net.createServer((s) => { s.on('data', (d) => s.write(d)); s.on('error', () => {}); });      // a stand-in for Kick's ingest (echoes)
  await new Promise((r) => kick.listen(0, '127.0.0.1', r));
  const upstreams = [];
  const relay = await startTlsProxy({ host: '127.0.0.1', port: kick.address().port, connect: (o, cb) => { const s = net.connect({ host: '127.0.0.1', port: kick.address().port }, cb); upstreams.push(s); return s; } });
  assert.equal(relay.link.active, 0);
  const c = net.connect(relay.port, '127.0.0.1');
  await new Promise((r) => c.once('connect', r));
  c.write('hello'); await new Promise((r) => c.once('data', r));
  assert.equal(relay.link.active, 1);
  assert.equal(relay.link.connects, 1);
  upstreams[0].destroy();                                      // Kick (or the network) drops the connection
  await wait(100);
  assert.equal(relay.link.active, 0, 'the lost link is noticed');
  assert.ok(relay.link.lastDownAt > 0);
  const c2 = net.connect(relay.port, '127.0.0.1'); await new Promise((r) => c2.once('connect', r)); c2.write('again'); await new Promise((r) => c2.once('data', r));
  assert.equal(relay.link.active, 1, 'a new connection counts again');
  c2.destroy(); await wait(100);
  assert.equal(relay.link.active, 0, 'and closing from our side counts too');
  c.destroy(); relay.close(); kick.close();
});

test('relay: a failed attempt to reach Kick is never counted as a link', async () => {
  const relay = await startTlsProxy({ host: '127.0.0.1', port: 1, connect: (o, cb) => net.connect({ host: '127.0.0.1', port: 1 }, cb) });
  const c = net.connect(relay.port, '127.0.0.1'); c.on('error', () => {}); await wait(200);
  assert.equal(relay.link.active, 0); assert.equal(relay.link.connects, 0);
  c.destroy(); relay.close();
});
