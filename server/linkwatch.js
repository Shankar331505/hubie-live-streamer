// Decides when the link to Kick has been lost for long enough to restart the encoder. Pure logic (the caller supplies the clock), so it is tested.
// `link` is the live-connection count kept by the TLS relay (tlsproxy.js).
//   * a freshly launched encoder gets `graceMs` to connect before a missing link counts
//   * the link must be missing for `downMs` in a row (a quick reconnect inside the relay is not a loss)
//   * after a restart, the next one waits `backoff` (20 s, 40 s, ... up to 5 min); a link that has held for 2 minutes resets the wait
export function createLinkWatch({ link, graceMs = 60000, downMs = 10000, firstBackoffMs = 20000, maxBackoffMs = 300000, holdResetMs = 120000 }) {
  let downSince = 0, lastRestart = 0, backoff = firstBackoffMs;
  return {
    // returns null (all fine) or { waitedMs } when the encoder should be restarted now
    check(now, launchedAt) {
      if (link.active > 0) { downSince = 0; if (now - link.lastUpAt >= holdResetMs) backoff = firstBackoffMs; return null; }
      if (now - launchedAt < graceMs) return null;
      if (!downSince) { downSince = now; return null; }
      if (now - downSince < downMs || now - lastRestart < backoff) return null;
      lastRestart = now; downSince = 0;
      const waited = backoff; backoff = Math.min(backoff * 2, maxBackoffMs);
      return { waitedMs: waited };
    },
    reset() { downSince = 0; },
  };
}
