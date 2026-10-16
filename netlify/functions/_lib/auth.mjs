import { createHmac, timingSafeEqual, scryptSync } from 'node:crypto';

const COOKIE = 'gojo_admin';

function b64json(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function sign(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }

export function verifyPassword(password) {
  const encoded = process.env.GOJO_ADMIN_PASSWORD_HASH || '';
  const [kind, saltHex, hashHex] = encoded.split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex || !password) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

export function createSession(role = 'admin', hours = 12) {
  const secret = process.env.GOJO_ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw Object.assign(new Error('Admin session secret saknas.'), { status: 503, code: 'admin_not_configured' });
  const body = b64json({ role, exp: Date.now() + hours * 3600000 });
  return `${body}.${sign(body, secret)}`;
}

export function sessionCookie(value, maxAge = 43200) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const item of raw.split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function requireAdmin(req) {
  const token = getCookie(req, COOKIE);
  const secret = process.env.GOJO_ADMIN_SESSION_SECRET;
  if (!token || !secret) throw Object.assign(new Error('Logga in igen.'), { status: 401, code: 'unauthorized' });
  const [body, signature] = token.split('.');
  if (!body || !signature) throw Object.assign(new Error('Logga in igen.'), { status: 401, code: 'unauthorized' });
  const expected = sign(body, secret);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Object.assign(new Error('Logga in igen.'), { status: 401, code: 'unauthorized' });
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { payload = null; }
  if (!payload || payload.exp < Date.now()) throw Object.assign(new Error('Sessionen har gått ut.'), { status: 401, code: 'unauthorized' });
  return payload;
}
