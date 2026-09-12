# Northstar Portfolio

A small multi-tenant investment tracker. Each client organisation ("tenant") signs in, uploads a CSV of holdings, and sees market value by asset class plus the return over the period the file covers. A tenant can never see another tenant's data.

React + TypeScript + Vite + Tailwind · Node + Express · PostgreSQL 16 · Docker Compose

---

## Quick start

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) running. Nothing else.

```bash
git clone <repository-url>
cd northstar
cp .env.example .env
docker compose up --build
```

Open **http://localhost:8080** and sign in:

| Email | Password | Tenant |
|---|---|---|
| `tenant_a@example.com` | `Password123!` | Alpha Capital |
| `tenant_b@example.com` | `Password123!` | Beacon Advisors |

Both accounts are listed on the sign-in screen and fill the form when clicked.

Upload `data/sample_good.csv` as Alpha Capital. You should see **$96,400.00** and **+4.10%**.

To stop, press `Ctrl+C`. To wipe the database and start clean:

```bash
docker compose down -v
```

### Notes for a first-time reader

`docker compose up --build` starts three containers: PostgreSQL, the API, and the web client behind nginx. The database schema is created and the two demo accounts are seeded automatically on first boot, so there are no manual SQL steps. Each service waits for the one below it to report healthy, so the command either works or tells you why.

Windows PowerShell doesn't support `&&` between commands — run each on its own line.

| Address | What it is |
|---|---|
| http://localhost:8080 | the app |
| http://localhost:4000/healthz | API is alive |
| http://localhost:4000/readyz | API can reach the database |

---

## Running without Docker

You need Node 22+ and a PostgreSQL 16 server.

Create a database and a superuser-capable role, then in `api/.env.local`:

```
NODE_ENV=development
PORT=4000
ADMIN_DATABASE_URL=postgres://<admin_user>:<password>@localhost:5432/northstar
APP_DATABASE_URL=postgres://northstar_app:northstar_app_local_dev@localhost:5432/northstar
APP_DB_PASSWORD=northstar_app_local_dev
JWT_SECRET=dev_only_insecure_secret_change_before_deploying
SEED_PASSWORD=Password123!
```

The API creates the restricted `northstar_app` role itself on boot, so only the admin credentials need to exist beforehand.

```bash
cd api
npm install
node --env-file=.env.local --import tsx src/index.ts
```

In a second terminal:

```bash
cd web
npm install
npm run dev
```

The client runs at http://localhost:5173 and proxies `/api` to port 4000, so the session cookie stays same-origin.

If you only want Postgres in Docker: `docker compose up -d db`, then follow the steps above.

---

## Screenshots

| | |
|---|---|
| **Sign in** | ![Sign in](docs/screenshots/01-login.png) |
| **Dashboard** | ![Dashboard](docs/screenshots/02-dashboard.png) |
| **A file with problems is rejected in full** | ![Rejected upload](docs/screenshots/03-rejected.png) |
| **Importing the valid rows is an explicit choice** | ![Partial import](docs/screenshots/04-partial.png) |
| **A second tenant sees only its own holdings** | ![Tenant isolation](docs/screenshots/05-tenant-b.png) |
| **Verification script** | ![Verification](docs/screenshots/06-verify.png) |
| **Mobile layout** | ![Mobile](docs/screenshots/07-mobile.png) |

---

## Verifying it works

### Automated

```bash
node scripts/verify-isolation.mjs
```

24 checks covering authentication, session forgery, CSV validation, the computed figures, and cross-tenant access. Exits non-zero on failure, so it works as a CI step. Plain JavaScript with no dependencies, so it runs anywhere Node does.

```bash
cd api && npm test
```

8 unit tests over the CSV validator. No database required.

### By hand

Sign in as Alpha Capital and upload `data/sample_good.csv`:

| | Expected |
|---|---|
| Market value | $96,400.00 |
| Period return | +4.10% |
| Equity / Bond / Cash | $55,850.00 / $35,550.00 / $5,000.00 |

Then upload `data/sample_dirty.csv`. It is rejected, naming line 20 as an exact repeat of line 11. Choosing **Import 18 valid rows** produces exactly the figures above — the same answer as the clean file, reached deliberately.

This matters because the planted duplicate is an extra `2026-06-30,AAPL` row. Ingested silently it would report **$115,900.00** and **+25.16%** rather than $96,400.00 and +4.10%.

**Tenant isolation.** Open Alpha Capital in a normal window and Beacon Advisors in a private window, since cookies are per-profile. Give them different files and confirm neither sees the other's tickers. In Alpha's console:

```js
await fetch('/api/portfolio/summary?tenantId=2').then(r => r.json())
```

returns Alpha's own figures. The API never reads a tenant identifier from a request.

**Session handling.** In DevTools under Application → Cookies, `northstar_session` shows `HttpOnly` and `SameSite=Lax`. Typing `document.cookie` in the console does not reveal it. Editing a single character of the cookie value and refreshing returns you to the sign-in screen.

**Bad input.** Every one of these is rejected with the offending line number, and nothing is written:

| Input | Result |
|---|---|
| `2026-02-30` | not a valid calendar date |
| empty ticker | missing value |
| `-5` quantity | negative value |
| `abc` price | not a number |
| a date in the future | rejected |
| a row with 4 columns | malformed, no partial import offered |
| header missing `asset_class` | missing required column |
| header only, no rows | empty file |
| same date and ticker, different price | conflicting duplicate |

**Clearing data.** Each tenant can remove its own holdings from the dashboard, behind an inline confirmation. The endpoint issues `DELETE FROM holdings` with no `WHERE` clause at all — row-level security scopes it, which the verification script proves by clearing Alpha Capital and checking Beacon Advisors is untouched. This exists so a shared demo deployment doesn't accumulate whatever the previous visitor uploaded.

**Resilience.** Stop the API container with the dashboard open and press retry — you get "Cannot reach the server", not a blank page. Eleven failed sign-ins return 429; successful ones don't count toward that limit. Uploading the same valid file three times leaves 18 rows, not 54.

---

## How it works

### Tenant isolation

Two independent layers, either of which is sufficient on its own.

**The API never accepts a tenant identifier.** `tenant_id` is read only from the signed session cookie. No route takes it as a parameter, query value, or body field, so there is nothing to tamper with.

**PostgreSQL enforces it too.** Row-level security policies on `holdings`, `users` and `tenants` compare `tenant_id` against a transaction-local session variable:

```sql
CREATE POLICY holdings_isolation ON holdings
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
```

`USING` governs reads, `WITH CHECK` governs writes. Without the second, a crafted insert could write into another tenant's data. `current_tenant_id()` returns `NULL` when unset, and `tenant_id = NULL` is never true, so a missing tenant context yields zero rows rather than every row.

Three details make this real rather than decorative:

- A table's owner bypasses its own policies, so the API connects as `northstar_app`, a separate role with `NOBYPASSRLS` and grants limited to `SELECT, INSERT, UPDATE, DELETE` on `holdings` and nothing else. It cannot touch `users`, `tenants` or the schema. Migrations run as the admin role, whose pool is closed before the server starts accepting traffic.
- Tenant context is set with `set_config('app.tenant_id', $1, true)` inside a transaction. The third argument makes it transaction-local. Without it, the value would persist on the pooled connection and leak into the next request that reuses it.
- Application queries deliberately omit `WHERE tenant_id = ...`. `withTenant()` is the single place context is set, so the database is doing the work and a fault in it would surface immediately rather than hiding behind a redundant filter.

Login is the one query that cannot know its tenant yet, so it goes through a `SECURITY DEFINER` function that takes an exact email and returns at most one row, with `SET search_path` pinned to prevent search-path hijacking.

### CSV handling

Every row is validated before anything is written. A file with problems is rejected in full by default and the response names each offending line, column and reason. The user may then explicitly choose to import the valid rows; the unsafe path requires `?mode=skip-invalid` so no client can partially import by forgetting a flag.

Structural damage (missing columns, unreadable CSV, empty file, over the row limit) is treated as fatal, and partial import is not offered, because there is no meaningful subset to keep.

An exact duplicate and a contradicting one get different error codes. "Your file repeats a row" and "your file contradicts itself" are different problems to fix.

Three layers stop the duplicate independently: the validator reports it, `UNIQUE (tenant_id, as_of_date, ticker)` rejects it at the database, and `ON CONFLICT DO UPDATE` makes a repeated upload converge rather than accumulate.

### Money

`quantity` and `price` are validated by regular expression and passed to `NUMERIC(24,8)` as strings. `parseFloat` is never called on a monetary value. `market_value` is a generated column (`quantity * price`), so the derived figure cannot drift from its inputs — there is no code path that writes it. Aggregation and the return calculation happen in SQL over exact decimals, and values cross the API as strings, becoming numbers only when the browser formats them.

### Sessions

A JWT in an `HttpOnly` cookie. Script cannot read it, so an XSS cannot exfiltrate a credential for replay elsewhere. That trades XSS risk for CSRF risk, covered by `SameSite=Lax`, a JSON-only API, and an explicit CORS allowlist rather than `*`.

Failed sign-ins are rate limited to 10 per 15 minutes per IP; successful ones are not counted. A missing account is compared against a decoy hash so it costs the same time as a wrong password, preventing account enumeration.

### Other choices worth naming

The migration runner takes a PostgreSQL advisory lock, so simultaneously booting replicas cannot race, and stores a SHA-256 of each file so editing an applied migration fails loudly.

Rows are inserted via `unnest` of parallel arrays — one round trip per 5,000 rows rather than one per row.

`env.ts` validates configuration at boot and throws on anything missing. There is no `process.env.X || 'fallback'` anywhere, and the server refuses to start in production with the development JWT secret or without an explicit CORS origin.

`DATE` columns are returned as `YYYY-MM-DD` strings rather than JavaScript `Date` objects, which would otherwise shift by a day for anyone east or west of UTC.

Only one index exists on `holdings`, the one backing the unique constraint. Every query filters on a prefix of that key, so further indexes would cost write throughput for no read benefit.

---

## Deployment

The client is a static bundle and the API is a container, so they deploy separately.

### API on Render

`render.yaml` describes the service and a managed PostgreSQL instance.

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repository. It reads `render.yaml` and creates `northstar-api` plus `northstar-db`.
3. The first deploy fails, which is expected: three variables cannot be known in advance.
4. Set them under the service's **Environment** tab:

| Variable | Value |
|---|---|
| `APP_DB_PASSWORD` | any strong random string you choose |
| `APP_DATABASE_URL` | the internal database URL, with the user and password replaced by `northstar_app` and the value above |
| `CORS_ORIGIN` | the Vercel URL, once it exists |
| `KEEPALIVE_URL` | `https://<your-service>.onrender.com/healthz` |

`ADMIN_DATABASE_URL` is wired from the database automatically and `JWT_SECRET` is generated. `SEED_DEMO_ACCOUNTS` is set to `true` so the two demo accounts exist in this deployment; seeding is otherwise skipped in production.

To build `APP_DATABASE_URL`, take the internal connection string from the database page — it looks like `postgres://northstar_admin:xxxx@dpg-yyyy/northstar` — and swap the credentials for `northstar_app` and your chosen password. The API creates that role itself on boot, so it does not need to exist first.

If you use the external connection string rather than the internal one, also set `DATABASE_SSL=true`.

Render's free tier sleeps a service after 15 minutes without inbound traffic, and the cold start is roughly 50 seconds. Setting `KEEPALIVE_URL` makes the API request its own public health endpoint every 10 minutes, which registers as inbound traffic and keeps it warm. The timer is `unref()`ed so it never holds the process open during shutdown, and it does nothing at all unless the variable is set.

This is a workaround for a free-tier limitation rather than a pattern worth keeping. On a paid plan the service doesn't sleep and the variable should be left unset; if a ping is still wanted, an external scheduler is the cleaner place for it, because a service checking its own liveness cannot detect that it is down.

### Client on Vercel

`vercel.json` builds `web/` and serves `web/dist`, with SPA rewrites, immutable caching on hashed assets, and basic security headers.

1. Import the same repository in Vercel, leaving the root directory as the repository root.
2. Add environment variable `VITE_API_URL` set to the Render URL, with no trailing slash.
3. Deploy, then copy the resulting URL back into `CORS_ORIGIN` on Render and redeploy the API.

`VITE_API_URL` is read at build time, not runtime — Vite inlines it into the bundle. Changing it later requires a redeploy, not just a restart.

### Cross-origin cookies

Locally the client and API share an origin through a proxy, so `SameSite=Lax` works. Deployed to two different domains, the cookie must be `SameSite=None`, which browsers only accept with `Secure`. Both switch automatically on `NODE_ENV=production`:

```ts
secure: env.isProduction,
sameSite: env.isProduction ? "none" : "lax",
```

If sign-in succeeds but the dashboard immediately bounces back to the sign-in screen, the cookie is being dropped: check `CORS_ORIGIN` matches the client origin exactly, including scheme and any trailing path.

### Connection pooling

Render runs a long-lived container, so the standard pool of 10 connections is right. If the API were moved to serverless functions, each invocation would open its own pool and exhaust the database's connection limit quickly; that deployment needs a pooled connection string such as PgBouncer or Neon's pooled endpoint.

---

## Assumptions

An upload restates the rows it contains and leaves other dates untouched. Re-uploading the same file corrects those rows rather than duplicating them. Replacing the whole portfolio on each upload would also be defensible; this was chosen so a correction to one date cannot silently erase another.

The period is derived from the file: start is the earliest date present, end is the latest. A file covering a single date reports a 0% return rather than an error. If the starting value is zero the return is `null` and the interface shows a dash, since the percentage is undefined rather than infinite.

Asset class is stored as written after trimming and collapsing whitespace. `Equity` and `equity` would group separately. Canonicalising would need a controlled vocabulary, which isn't in scope.

Quantities and prices must be non-negative, so short positions are not representable.

Seed credentials are visible on the sign-in screen and seeding is skipped entirely when `NODE_ENV=production`. This is a demo convenience, not a production pattern.

---

## With more time

Refresh tokens with rotation and a server-side revocation list, so signing out invalidates a session everywhere rather than only clearing the local cookie.

Rate limiting backed by Redis with a per-account limiter and progressive backoff. The current limiter is in-process, so it resets on restart and doesn't coordinate across replicas.

An `upload_batches` table recording who uploaded what and when, with the ability to roll a batch back. Right now an upload is not attributable after the fact.

Integration tests against a throwaway PostgreSQL container, particularly asserting that RLS blocks a query that deliberately omits its tenant filter. The current suite covers the validator thoroughly but proves the isolation layer through the verification script rather than in CI.

Structured JSON logging with the request ID already attached to every response, and an error tracker.

Streaming the upload straight into `COPY` rather than buffering it in memory. The 5 MB cap makes buffering safe today; it would not be for 500 MB files.

---

## Layout

```
northstar/
├── docker-compose.yml
├── render.yaml
├── vercel.json
├── data/                    sample CSVs
├── scripts/
│   └── verify-isolation.mjs
├── api/
│   ├── Dockerfile
│   ├── test/
│   └── src/
│       ├── config/env.ts    boot-time configuration validation
│       ├── db/              pool, tenant scoping, migrations, seed
│       ├── csv/             parsing and validation
│       ├── http/            errors, auth middleware
│       ├── ops/             keep-alive
│       └── routes/          auth, holdings, portfolio
└── web/
    ├── Dockerfile           builds the bundle, serves it via nginx
    ├── nginx.conf
    └── src/
        ├── api/client.ts
        ├── components/
        └── pages/
```