This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment Variables

The following environment variables are required:

| Variable | Description |
|----------|-------------|
| `POSTGRES_URL` | PostgreSQL connection string. Required for builds — migrations run automatically during `next build` via `lib/db/migrate.ts`. Preview deployments use a Neon branch database; production uses the main database. |

## Local dev (self-hosted + PGlite)

This project uses four-layer env loading:
- Git-tracked defaults: `.env`
- Git-tracked environment overlays: `.env.dev` / `.env.prod`
- Local private overrides (not tracked): `.env.local`
- Local private environment overrides (not tracked): `.env.dev.local` / `.env.prod.local`

`apps/web/.env.example`, `apps/web/.env.dev.example`, and `apps/web/.env.prod.example` are starter templates for tracked files. Keep secrets like `AI_GATEWAY_API_KEY` in local-only files (for example `.env.local` / `.env.dev.local`) and never commit them.

```bash
bun install
cp apps/web/.env.example apps/web/.env
cp apps/web/.env.dev.example apps/web/.env.dev
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local and set AI_GATEWAY_API_KEY=...
bun run web:dev:pglite
```

Or from **`apps/web`**: `cp .env.dev.example .env.dev && cp .env.local.example .env.local` then `bun run dev:pglite`.

Env loading is automatic at startup (difference override mode):
- Base defaults: always load `.env` when present
- Environment override: load `.env.dev` (development) or `.env.prod` (production)
- Local private override: load `.env.local` when present
- Local private environment override: load `.env.dev.local` or `.env.prod.local` when present
- Later files override earlier files with the same key

Open **http://localhost:3000** (or **http://127.0.0.1:3000** — allowed for dev).

For production, copy `apps/web/.env.prod.example` to `apps/web/.env.prod`, generate your own secrets and keys, and do not reuse dev values.

## Getting Started

First, run the development server:

```bash
bun run web
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
