# Deploying Weyos (SCRUM-25)

Fly.io for the API and the engine sidecar, Timescale Cloud for the health-data store, Upstash
Redis (through Fly) for the cache and queue. **Two regions from day one, UK and US.** Region is
deploy-time configuration: one image, one Fly app per region, each pointed at its own stores. No
code path branches on region.

| Environment | Branch | Apps | Region |
|---|---|---|---|
| preview | `development` | `weyos-api-preview`, `weyos-engine-preview` | London (`lhr`) |
| production UK | `main` | `weyos-api-uk`, `weyos-engine-uk` | London (`lhr`) |
| production US | `main` | `weyos-api-us`, `weyos-engine-us` | Virginia (`iad`) |

Local dev stays as it is (`docker compose` for Postgres and Redis, `make sidecar`, `make dev`).

## What's in the repo

- `services/api/Dockerfile`, `services/engine-http/Dockerfile` (both build from the repo root).
- `deploy/fly/*.toml`: one file per app per region. The engine configs have **no** public
  service; the API reaches the engine as `weyos-engine-<name>.internal:8000` on Fly's private
  network. The sidecar has no auth, so it must never get a public address.
- `.github/workflows/deploy.yml`: `development` → preview, `main` → UK and US. Engine first,
  then API, then a readiness check against `/health/ready`.

## One-time setup (a person, with the accounts)

Nothing below is in the repo. Secrets are set on the apps, never committed.

1. **Fly.io.** Create an organisation, install `flyctl`, `fly auth login`. Create the apps
   (names must match the configs):
   ```bash
   for a in weyos-engine-preview weyos-api-preview weyos-engine-uk weyos-api-uk weyos-engine-us weyos-api-us; do
     fly apps create "$a"
   done
   ```
2. **Redis**, region-pinned, one per API app:
   ```bash
   fly redis create --name weyos-redis-preview --region lhr
   fly redis create --name weyos-redis-uk --region lhr
   fly redis create --name weyos-redis-us --region iad
   ```
   Each prints a `redis://…` URL.
3. **Timescale Cloud.** Create a service in **AWS eu-west-2 (London)** for UK/preview and one
   in **AWS us-east-1 (N. Virginia)** for US. Enable the TimescaleDB extension (default). Copy
   each connection string. Migrations run at API boot (`MigrationRunner`), so nothing else is
   needed on the database; keep the connection string's `sslmode=require`.
   - Preview can share the UK service with a separate database name, or have its own. Don't
     point preview at the production database.
4. **Supabase.** One project is fine for all environments while there are no real users;
   separate projects for preview and production once there are. Enable email auth and put
   `{{ .Token }}` in the email template (the app signs in with a code).
5. **Set the secrets** on each API app. Values come from steps 2–4:
   ```bash
   fly secrets set -a weyos-api-uk \
     DATABASE_URL='postgres://…eu-west-2…' \
     REDIS_URL='redis://…' \
     SUPABASE_URL='https://<project>.supabase.co' \
     SUPABASE_SERVICE_ROLE_KEY='…' \
     SUPABASE_JWT_SECRET='…'      # only for projects still on the HS256 JWT secret
   ```
   Repeat for `weyos-api-us` (US stores) and `weyos-api-preview`. The engine apps need no
   secrets.
6. **GitHub.** Add the repository secret `FLY_API_TOKEN` (`fly tokens create deploy -x 999999h`,
   scoped to the organisation), and create the `preview` and `production` environments in the
   repository settings so the deploy job can be gated (require a reviewer on `production`).
7. **DNS.** `fly certs add api.weyos.app -a weyos-api-uk` and point the CNAME at the app;
   `api-staging.weyos.app` → `weyos-api-preview`. The mobile build profiles already name these
   hosts in `apps/mobile/eas.json`.
   - US subjects need to reach `weyos-api-us`. Until routing by account region exists
     (SCRUM-77), the app has one API URL per build profile; a US-only build would point at the
     US app. Geographic routing of one hostname is part of SCRUM-77.

## First deploy

```bash
fly deploy --config deploy/fly/engine-preview.toml
fly deploy --config deploy/fly/api-preview.toml
curl https://weyos-api-preview.fly.dev/health/ready
```

After that, pushes to `development` and `main` deploy automatically.

## What a region guarantees, and what it doesn't yet

- Health data for a subject is written to the database of the region their API app is in,
  and the engine that decides for them runs in that region. That is what SCRUM-25's
  "region-pinned stores" AC asks for.
- What is **not** done: routing one hostname to the right region by account, cross-region
  replication of anything, and Supabase Auth region (Supabase projects are single-region; pick
  the project region when creating it). All SCRUM-77.

## Local check of the images

```bash
docker build -f services/engine-http/Dockerfile -t weyos-engine .
docker build -f services/api/Dockerfile -t weyos-api .
docker run --rm -p 8000:8000 weyos-engine            # then GET :8000/healthz
```

The API image needs `DATABASE_URL`, `REDIS_URL`, `SUPABASE_URL` and `ENGINE_URL` to boot; it
refuses to start without a database, by design.
