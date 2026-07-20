'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
type F = z.infer<typeof schema>;
export function LoginForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });
  async function onSubmit(data: F) {
    setErr(null);
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const b = await r.json();
    if (!r.ok) { setErr(b.detail ?? 'Login failed'); return; }
    router.push(`/${locale}/dashboard`); router.refresh();
  }
  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {err && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input {...register('email')} type="email" className="input" dir="ltr" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input {...register('password')} type="password" className="input" dir="ltr" /></div>
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
