# BI Agent

React SSR frontend with a Python API backend.

## Stack

- Frontend: Next.js App Router, TypeScript, React SSR
- Backend: FastAPI, Uvicorn
- Monorepo: pnpm workspaces with `apps/` and `packages/`

## Project structure

```text
bi-agent/
  apps/
    web/      # Next.js SSR frontend
    api/      # FastAPI backend
  packages/
    shared/   # shared code placeholder
```

## Setup

```bash
pnpm install
uv sync --project apps/api
```

## Development

```bash
pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

The frontend reads `API_URL` on the server. Browser requests to `/api/*` are
handled by Next.js Route Handlers, which call the FastAPI `/api/*` routes on the
server. For example, `/api/ping` calls `http://localhost:8000/api/ping`.

The backend reads datasource type metadata from PostgreSQL. By default it uses:

```bash
BI_AGENT_DATABASE_URL=postgresql://zhourukun@localhost:5432/bi-agent-local
```

Create the database before starting the API:

```bash
createdb "bi-agent-local"
```

On API startup, the backend creates `public.datasource_types` and initializes
the built-in datasource types.

File uploads use MinIO. Local development defaults:

```bash
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=bi-agent
MINIO_SECURE=false
```

The API returns presigned URLs. The browser uploads the file directly to MinIO
with `PUT`, then stores the returned `object_key` with the datasource config.

## Workspace scripts

```bash
pnpm dev              # frontend + backend
pnpm dev:web          # Next.js only
pnpm dev:api          # FastAPI only
pnpm lint             # frontend + backend lint
pnpm lint:web         # frontend lint
pnpm lint:api         # backend lint
pnpm format           # format frontend + backend code
pnpm format:check     # check frontend + backend formatting
pnpm build            # frontend production build
```
