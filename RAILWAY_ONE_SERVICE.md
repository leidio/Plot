# Deploy Plot with one Railway service (backend serves frontend)

Use this when you want a single URL for the whole app (no separate frontend service).

## 1. Railway: use only the backend service

- You can **remove or ignore** the **frontend** service on Railway (or delete it).
- Use only the **plot-backend** service. All steps below refer to that service.

## 2. Backend service settings (plot-backend)

In **Settings** for **plot-backend**:

| Setting | Value |
|--------|--------|
| **Root Directory** | Leave empty (repo root). |
| **Custom Build Command** | `rm -rf frontend/node_modules/.vite 2>/dev/null; npm ci && npm run build --workspace=frontend` |
| **Custom Start Command** | `npm run start --workspace=backend` |

## 3. Backend service variables (plot-backend → Variables)

Keep what you have and add the two for the frontend build:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | (already set) |
| `DIRECT_URL` | (already set) |
| `JWT_SECRET` | (already set) |
| `FRONTEND_URL` | `https://plot-backend-prod.up.railway.app` (your backend’s public URL) |
| `VITE_API_URL` | `/api` |
| `VITE_MAPBOX_ACCESS_TOKEN` | Your Mapbox token (same as in frontend/.env) |

`VITE_API_URL=/api` makes the built frontend call the same origin; no CORS issues.

## 4. One URL for everything

After deploy, open:

**https://plot-backend-prod.up.railway.app**

- `/` → your app (built frontend)
- `/api/...` → API
- `/health` → health check

## 5. Local development (unchanged)

- Run backend: `cd backend && npm run dev`
- Run frontend: `cd frontend && npm run dev`
- Backend does not serve the frontend locally unless you’ve run `npm run build` in the frontend; use the Vite dev server as usual.

---

## 6. Optional: two Railway services (separate frontend + backend)

If the browser opens **`https://plot-frontend.up.railway.app`** and the API is **`https://plot-backend.up.railway.app`**:

1. **Frontend service → Variables** (must be present **before** `npm run build`, because Vite inlines `VITE_*` at build time):

   | Key | Example value |
   |-----|----------------|
   | `VITE_API_URL` | `https://plot-backend.up.railway.app/api` |
   | `VITE_MAPBOX_ACCESS_TOKEN` | (your token) |

2. **Backend (`plot-backend`) service → Variables:** set **`FRONTEND_URL`** to the **exact** browser origin of your UI (no path), e.g. `https://plot-prod.up.railway.app`. This is required for **CORS** on `/api/auth/register`. If it’s missing or wrong, sign-up fails or behaves like a network error. Add `http://plot-prod.up.railway.app` too if people still open the `http` link (comma-separated).

After deploying the backend, auth cookies use **`SameSite=None; Secure`** when the request comes from a different Railway hostname than the API (e.g. `plot-prod` → `plot-backend-prod`), so sessions work across your two services.

If you skip `VITE_API_URL` on a standalone frontend build, the app used to fall back to `http://localhost:3001/api` and sign-up would fail in production. The app now defaults to **same-origin** `/api` in production when `VITE_API_URL` is unset (correct for **one** service only). For two services, **`VITE_API_URL` is required**.
