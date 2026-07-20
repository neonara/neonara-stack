import type { ReactNode } from 'react';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
interface Props { children: ReactNode; params: Promise<{ locale: string }> }
export default async function PlatformLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-e border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-semibold text-sm">Neonara App</span>
        </div>
        <nav className="space-y-1">
          <a href={`/${locale}/dashboard`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Dashboard</a>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">Welcome, {session.email}</span>
          <form action="/api/auth/logout" method="POST">
            <button className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
