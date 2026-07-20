import { redirect } from 'next/navigation';
import { getSession } from './session';
import type { Role, SessionUser } from './types';

export async function requireAuth(locale: string): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect(`/${locale}/login`);
  return s;
}

export async function requireRole(locale: string, roles: Role[]): Promise<SessionUser> {
  const s = await requireAuth(locale);
  if (!roles.includes(s.role)) redirect(`/${locale}/dashboard`);
  return s;
}
