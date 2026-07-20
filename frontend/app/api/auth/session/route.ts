import { getSession } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
export async function GET() {
  const s = await getSession();
  return s ? NextResponse.json(s) : NextResponse.json(null, { status: 401 });
}
