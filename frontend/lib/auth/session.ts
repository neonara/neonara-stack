import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { SessionUser } from './types';

const secret = new TextEncoder().encode(
  process.env.NEXT_SESSION_SECRET ?? 'fallback-dev-secret-32chars!!'
);
const COOKIE = 'app_session';

export async function createSession(payload: SessionUser & { djangoAccess: string; djangoRefresh: string }) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 60 * 60 * 24 * 7, path: '/',
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch { return null; }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
