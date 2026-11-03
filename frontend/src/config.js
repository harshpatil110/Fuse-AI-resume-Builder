// Vercel-deploy branch only: gateway base URL.
// Locally (no VITE_API_URL set) this falls back to the local gateway on :5000.
// On Vercel, set VITE_API_URL=https://fuse-api-gateway.vercel.app before building —
// Vite inlines VITE_* vars at build time, so the value must be present at build.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000';
