// A tiny local relay: ffmpeg speaks plain RTMP to 127.0.0.1 (this machine only), and we forward it to the real
// ingest server over TLS using Node's own TLS (OpenSSL). Some ffmpeg builds on macOS use Apple's old SecureTransport,
// which Kick's ingest (AWS IVS) resets mid-connection. Everything that leaves this computer is still encrypted.
import net from 'node:net';
import tls from 'node:tls';

//
// It also keeps count of the live links to Kick (`link.active`). ffmpeg does not retry a dropped link, and it carries on recording to disk
// when the Kick side dies, so this count is how the program notices that the stream is no longer reaching Kick (Kick ends any single stream
// after 48 hours, and networks drop too) and restarts the encoder.
export function startTlsProxy({ host, port = 443, log = () => {}, connect = tls.connect }) {
  const link = { active: 0, lastUpAt: 0, lastDownAt: 0, connects: 0 };
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      client.pause();
      let counted = false;
      const up = connect({ host, port, servername: host, minVersion: 'TLSv1.2' }, () => { counted = true; link.active++; link.connects++; link.lastUpAt = Date.now(); client.pipe(up); up.pipe(client); client.resume(); });
      const end = () => { if (counted) { counted = false; link.active--; link.lastDownAt = Date.now(); } client.destroy(); up.destroy(); };
      client.setNoDelay(true); up.setNoDelay(true);
      client.on('error', end); client.on('close', end);
      up.on('error', (e) => { log('tls relay: ' + e.message); end(); }); up.on('close', end);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, link, close: () => server.close() }));
  });
}
