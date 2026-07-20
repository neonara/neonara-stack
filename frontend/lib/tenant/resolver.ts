const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
export async function getTenantBranding(schema: string) {
  if (!schema || schema === 'public') return { name: 'App', primary_color: '#1E3A8A', logo_url: '' };
  try {
    const r = await fetch(`${API}/api/v1/tenants/?schema=${schema}`, { next: { revalidate: 300 } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.results?.[0] ?? null;
  } catch { return null; }
}
