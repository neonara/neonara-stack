import { LoginForm } from '@/components/auth/LoginForm';
interface Props { params: Promise<{ locale: string }> }
export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4" style={{ background: 'var(--color-primary)' }}>
            <span className="text-white font-bold text-xl">N</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Welcome back</h1>
        </div>
        <LoginForm locale={locale} />
      </div>
    </div>
  );
}
