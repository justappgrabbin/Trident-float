import { timingSafeEqual } from 'node:crypto';

/** Explicit opt-in for an externally reachable Trident Computer process. */
export function accessConfig(env = process.env) {
  const bindHost = String(env.TRIDENT_BIND_HOST || '127.0.0.1').trim();
  const token = String(env.TRIDENT_ACCESS_TOKEN || '');
  const allowedOrigin = String(env.TRIDENT_ALLOWED_ORIGIN || '').trim();
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(bindHost);
  if (!loopback && token.length < 32)
    throw new Error('Remote bind requires TRIDENT_ACCESS_TOKEN with at least 32 characters');
  if (allowedOrigin && (!/^https?:\/\/[^/?#]+$/.test(allowedOrigin) || allowedOrigin.endsWith('/')))
    throw new Error('TRIDENT_ALLOWED_ORIGIN must be an origin with no path');
  return { bindHost, token, allowedOrigin, loopback };
}

export function authorized(headers, config) {
  if (!config.token) return true;
  const received = String(headers.authorization || '');
  const expected = 'Bearer ' + config.token;
  const a = Buffer.from(received, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validOrigin(headers, config, port) {
  const origin = headers.origin;
  if (!origin) return true; // Android's native HTTP client is not a browser.
  if (config.allowedOrigin && origin === config.allowedOrigin) return true;
  return config.loopback && (
    origin === 'http://127.0.0.1:' + port ||
    origin === 'http://localhost:' + port
  );
}

export function corsHeaders(headers, config, port) {
  if (headers.origin && validOrigin(headers, config, port))
    return { 'access-control-allow-origin': headers.origin, vary: 'Origin' };
  return {};
}
