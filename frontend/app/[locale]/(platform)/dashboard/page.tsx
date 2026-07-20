import { getSession } from '@/lib/auth/session';
export default async function DashboardPage() {
  const session = await getSession();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-500">Signed in as <strong>{session?.email}</strong> · Role: <strong>{session?.role}</strong></p>
    </div>
  );
}
