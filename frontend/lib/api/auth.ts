const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
export async function djangoLogin(email: string, password: string) {
  const r = await fetch(`${API}/api/v1/auth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) { const d = await r.json(); throw new Error(d?.detail ?? 'Login failed'); }
  return r.json() as Promise<{ access: string; refresh: string }>;
}
export async function djangoRefresh(refresh: string) {
  const r = await fetch(`${API}/api/v1/auth/token/refresh/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!r.ok) throw new Error('Refresh failed');
  return r.json() as Promise<{ access: string; refresh: string }>;
}
export async function djangoLogout(refresh: string) {
  await fetch(`${API}/api/v1/auth/logout/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  }).catch(() => {});
}
