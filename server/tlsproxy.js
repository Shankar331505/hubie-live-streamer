// A tiny local relay: ffmpeg speaks plain RTMP to 127.0.0.1 (this machine only), and we forward it to the real
// ingest server over TLS using Node's own TLS (OpenSSL). Some ffmpeg builds on macOS use Apple's old SecureTransport,
// which Kick's ingest (AWS IVS) resets mid-connection. Everything that leaves this computer is still encrypted.
import net from 'node:net';
import tls from 'node:tls';

export function startTlsProxy({ host, port = 443, log = () => {} }) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      client.pause();
      const up = tls.connect({ host, port, servername: host, minVersion: 'TLSv1.2' }, () => { client.pipe(up); up.pipe(client); client.resume(); });
      const end = () => { client.destroy(); up.destroy(); };
      client.setNoDelay(true); up.setNoDelay(true);
      client.on('error', end); client.on('close', end);
      up.on('error', (e) => { log('tls relay: ' + e.message); end(); }); up.on('close', end);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
}
