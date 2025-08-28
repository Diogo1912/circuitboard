# Circuitboard

## Development

- Frontend: `cd web && npm run dev` (Vite, proxies `/api` to backend)
- Backend: `cd backend && npm run dev`

## Deploy to Railway

1. Create a new Railway project and connect this GitHub repo.
2. Set environment variables on the service:
   - `OPENAI_API_KEY`: your key
   - optional `OPENAI_BASE_URL`: custom base URL
3. Deploy: Railway will install backend deps, run `postinstall` to build the frontend, then start Express. Express serves `web/dist` and exposes `/api`.
4. The service port is taken from `PORT` (Railway provides it). No extra config needed.
