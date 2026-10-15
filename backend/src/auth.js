// Autenticação sem dependências externas.
// Senha: scrypt + salt. Token de sessão: HMAC assinado (formato tipo JWT simples).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const SECRET = process.env.SIGNAGE_SECRET || 'troque-este-segredo-em-producao';

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(plain, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && timingSafeEqual(test, ref);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => createHmac('sha256', SECRET).update(data).digest('base64url');

// Token do usuário (painel). Expira em 7 dias.
export function issueToken(payload) {
  const body = b64({ ...payload, exp: Date.now() + 7 * 24 * 3600 * 1000 });
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// Token do player (dispositivo): opaco e longo.
export function deviceToken() {
  return randomBytes(24).toString('base64url');
}
