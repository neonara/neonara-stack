import ky, { type KyInstance } from 'ky';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
export const apiClient: KyInstance = ky.create({
  prefixUrl: API, credentials: 'include',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  hooks: {
    beforeError: [async (error) => {
      if (error.response?.status === 401) {
        const r = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!r.ok) window.location.href = `/${document.documentElement.lang || 'en'}/login?reason=session_expired`;
      }
      return error;
    }],
  },
  retry: { limit: 1, statusCodes: [401] },
});
