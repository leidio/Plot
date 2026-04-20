/**
 * Resolve API base URL for axios.
 *
 * - **Local dev:** `http://localhost:3001/api` when `VITE_API_URL` is unset.
 * - **Production, unset:** same-origin `/api` (backend serves the built SPA — see RAILWAY_ONE_SERVICE.md).
 * - **`VITE_API_URL`:** absolute (`https://api.example.com/api`) or relative (`/api`) for same host.
 *
 * If the frontend is on a **different** host than the API, you must set `VITE_API_URL` at build time
 * to the public API base (e.g. `https://your-backend.up.railway.app/api`).
 */

export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== '') {
    const env = String(raw).trim();
    if (env.startsWith('/')) {
      if (typeof window === 'undefined') {
        return env;
      }
      const origin = window.location.origin.replace(/\/$/, '');
      return `${origin}${env}`;
    }
    return env.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:3001/api';
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }

  return 'http://localhost:3001/api';
}

/** Socket.IO origin (no `/api` path). */
export function getSocketBaseUrl() {
  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== '') {
    const env = String(raw).trim();
    if (env.startsWith('/')) {
      if (typeof window !== 'undefined') {
        return window.location.origin.replace(/\/$/, '');
      }
      return 'http://localhost:3001';
    }
    const withoutApi = env.replace(/\/api\/?$/, '');
    if (withoutApi) {
      return withoutApi.replace(/\/$/, '');
    }
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }

  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }

  return 'http://localhost:3001';
}
