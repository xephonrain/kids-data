// 設定画面ロック用のパスワードハッシュ。平文は保存せず、PBKDF2(SHA-256)+ランダムソルトのハッシュだけを保存する。
// これは「誤操作防止」用であり、GitHub上のデータの保護は非公開リポジトリとアクセストークンが担う。

export const LOCK_ITERATIONS = 210_000;
export const MIN_PASSWORD_LENGTH = 4;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toB64(bits);
}

export interface LockRecord {
  lockSalt: string;
  lockHash: string;
  lockIterations: number;
}

export async function createLock(password: string): Promise<LockRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return { lockSalt: toB64(salt), lockHash: await derive(password, salt, LOCK_ITERATIONS), lockIterations: LOCK_ITERATIONS };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyLock(password: string, rec: { lockSalt: string | null; lockHash: string | null; lockIterations: number | null }): Promise<boolean> {
  if (!rec.lockSalt || !rec.lockHash || !rec.lockIterations) return false;
  const h = await derive(password, fromB64(rec.lockSalt), rec.lockIterations);
  return constantTimeEqual(h, rec.lockHash);
}
