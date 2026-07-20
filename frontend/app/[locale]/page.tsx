import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
interface Props { params: Promise<{ locale: string }> }
export default async function Home({ params }: Props) {
  const { locale } = await params;
  const s = await getSession();
  redirect(s ? `/${locale}/dashboard` : `/${locale}/login`);
}
