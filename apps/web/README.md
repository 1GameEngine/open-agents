This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment Variables

The following environment variables are required:

| Variable | Description |
|----------|-------------|
| `POSTGRES_URL` | PostgreSQL connection string. Required for builds — migrations run automatically during `next build` via `lib/db/migrate.ts`. Preview deployments use a Neon branch database; production uses the main database. |

## Local dev (self-hosted + PGlite)

`apps/web/.env.example` has defaults for **PGlite on `127.0.0.1:5433`**, **local-fs** sandboxes under `/tmp/open-agents-sandboxes`, and dev crypto / bootstrap keys.

**`AI_GATEWAY_API_KEY` is not in git** — copy the example file, then add your [Vercel AI Gateway](https://vercel.com/dashboard/ai-gateway) key locally:

```bash
bun install
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env and set AI_GATEWAY_API_KEY=...
bun run web:dev:pglite
```

Or from **`apps/web`**: `cp .env.example .env` then `bun run dev:pglite`.

Open **http://localhost:3000** (or **http://127.0.0.1:3000** — allowed for dev).

For production, generate your own secrets and keys; do not reuse the example crypto values.

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
