import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { djangoLogout } from '@/lib/api/auth';
const secret = new TextEncoder().encode(process.env.NEXT_SESSION_SECRET ?? 'fallback-dev-secret-32chars!!');
export async function POST(request: NextRequest) {
  const token = request.cookies.get('app_session')?.value;
  if (token) {
    try { const { payload } = await jwtVerify(token, secret); await djangoLogout(String(payload.djangoRefresh ?? '')); } catch {}
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('app_session');
  return res;
}
