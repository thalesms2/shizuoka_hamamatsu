# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

API for a law-firm management system covering two domains: **financial control** and **client communication**. It is multi-tenant software: each law firm is a tenant, and tenants' data must stay isolated from each other. The tenant is the primary partition of every business entity.

Two separate front-ends consume this single API:

- the **CRM**, used by the law firm's staff;
- the **client portal**, used by the firm's own end clients.

Both write through this API, so authorization is role-based: the same endpoint may be reachable by both front-ends with different permissions, and a client-portal role must never read or act outside its own scope. Role checks are part of the endpoint contract, not an afterthought.

## Architecture

Built so far:

- **Database:** PostgreSQL 18 with Prisma 7 as the ORM. Development runs Postgres from the `docker-compose` file here; production points at an externally managed service. Only the connection string differs — nothing may depend on the database being local.
- **Tenancy:** every tenant-scoped table carries `tenant_id`, and `createTenantClient` enforces the filter rather than leaving it to discipline. A tenant is never taken from a request body or path parameter — only from the token.
- **Auth:** signed JWT (JWS) carrying `userId` (`sub`), `tenantId` and `role`, plus opaque rotating refresh tokens in the database. The payload is signed, not encrypted — it is readable by whoever holds the token, so it must never carry a secret.
- **WhatsApp:** Z-API, with one instance per tenant in `phones`. Outbound through `POST /messages`, inbound through a public webhook.

Not built yet:

- **Real-time:** Socket.IO (`@nestjs/websockets` with the Socket.IO adapter) is the decided direction. Isolation will use rooms: one per tenant, and one per user for events addressed to a single person; a gateway must never broadcast outside the tenant room of the connection. The same access token is meant to authenticate the handshake — a connection rejected before joining any room if the token is missing or invalid.
- **The financial domain.** `services`, `invoices` and `transactions` exist as tables with no module, service or route behind them.
- **No CRUD** for `tenants`, `clients` or `phones`: those rows are created by the seed or by hand in the database.
- **No rate limiting.** Failed logins are logged but nothing throttles them; `@nestjs/throttler` is the first-party answer.

## Commands

```bash
npm run start:dev        # watch mode (loads .env via `nest start --env-file`)
npm run build            # nest build -> dist/
npm run lint             # oxlint --type-aware src/ test/
npm run format           # prettier --write

npm test                 # unit tests (vitest, **/*.spec.ts)
npm run test:e2e         # e2e tests: recreates the test database, then runs them
npm run db:test:reset    # drop and rebuild the test database on its own
npm run test:cov         # coverage

npx vitest run src/app.controller.spec.ts        # single file
npx vitest run -t 'should return "Hello World!"' # single test by name
```

```bash
docker compose up -d postgres   # development Postgres on $POSTGRES_PORT (default 5432)
docker compose down             # stop, keeping data
docker compose down -v          # stop and wipe the volume
```

The compose file reads `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` from it, and `DATABASE_URL` must agree with those four values. The volume mounts at `/var/lib/postgresql`, not `/var/lib/postgresql/data` — the Postgres 18 image refuses to start with the old path.

```bash
npm run prisma:generate  # regenerate the client into src/generated/prisma
npm run prisma:migrate   # create and apply a migration (interactive terminal only)
npm run prisma:deploy    # apply pending migrations (production)
npm run prisma:studio    # browse the data at http://localhost:5555
npm run prisma:seed      # create the test tenant and the admin user (idempotent)
```

`npm run start`/`start:dev`/`start:debug` pass `--env-file .env`; `start:prod` (`node dist/main`) does not — set env vars in the environment there.

`prisma migrate dev` refuses to run without a TTY. From a script or an agent, generate the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o <dir>/migration.sql` into a folder named with a **UTC** timestamp, then apply it with `prisma migrate deploy`.

### Environment

| Variable | Used by |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | the development compose service |
| `DATABASE_URL` | Prisma; must agree with the four above |
| `JWT_SECRET` | required — `AuthModule` throws at import time without it |
| `JWT_EXPIRES_IN` | access token lifetime, default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | refresh token lifetime, default `7` |
| `CORS_ORIGINS` | comma-separated browser origins; unset means every browser origin is refused |
| `PORT` | HTTP port, default 3000 |
| `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` | NestJS Observe |

`.env` is gitignored — copy `.env.example`. `.env.test` **is** committed: it only points at the ephemeral test container, and the e2e suite must work right after a clone.

## Code map

`AppModule` imports `ObserveModule`, `PrismaModule`, `AuthModule` and `MessagingModule`, and registers `StandardSchemaValidationPipe` as `APP_PIPE`.

| Directory | What lives there |
| --- | --- |
| `src/auth/` | `AuthController` (login, refresh, logout, signup), `AuthService`, `RefreshTokensService`, `PasswordService`, the two global guards, and the `@Public()` / `@Roles()` / `@CurrentUser()` decorators |
| `src/users/` | `UsersService` and the user Zod schemas. Has no controller: user creation is reached through `POST /auth/signup` |
| `src/messaging/` | `MessagesController` (send + Z-API webhook), `MessagesService`, `ZApiClient`, `MessageDirection` |
| `src/access-histories/` | `AccessHistoriesService` and `AccessOperation` |
| `src/prisma/` | `PrismaService`, the tenant-scoped client extension and its request-scoped provider |
| `src/generated/prisma/` | Generated Prisma client — gitignored, never edited |
| `prisma/` | `schema.prisma`, `migrations/`, `seed.ts` |
| `test/` | e2e specs; unit specs sit next to the code in `src/` |

Four things are non-default and matter when adding code:

**ESM.** `"type": "module"` with `module: nodenext`. Relative imports must end in `.js` (`./app.service.js`), there is no `__dirname` (use `import.meta.dirname`), and tests are Vitest — mocks are `vi.fn()`, never `jest.fn()`. Vitest runs with `globals: true` and resolves tsconfig path aliases (`resolve.tsconfigPaths`, requires Vite 8), so aliases added by `nest g library` work in tests without extra config.

**NestJS Observe instrumentation.** `src/app.module.ts` calls `createObserveModule()` at module scope and exports both `ObserveModule` (imported by `AppModule`) and `ObserveInstrument`, which `src/main.ts` passes as `NestFactory.create(AppModule, { instrument: ObserveInstrument })`. Both halves are required — dropping either silently disables tracing. Credentials come from `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` (written by `npx @nestjs/observe link`).

**Two databases.** `postgres` (port 5432, named volume, survives restarts) is for development. `postgres-test` (port 5433, database `shizuoka_hamamatsu_test`) is for the e2e suite: its data lives on a `tmpfs`, so the container holds nothing on disk. `npm run test:e2e` runs `scripts/reset-test-db.sh` first, which destroys and recreates that container and applies every migration — each run starts from an empty schema, and the development database is never touched. The suite reads `.env.test` (loaded with `override: true` in `vitest.config.e2e.ts`), never `.env`.

Unit tests (`npm test`) reach no database at all: Prisma is mocked with `vi.fn()` everywhere, and the suite passes with Docker stopped.

**Prisma 7.** Configuration lives in `prisma.config.ts`, not in the `datasource` block — the schema declares no `url`, and the CLI reads `DATABASE_URL` from `.env` through `dotenv`. The client uses the `prisma-client` generator (not the legacy `prisma-client-js`) with a driver adapter: `PrismaService` instantiates `PrismaClient` with `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.

The generated client is written to `src/generated/prisma` and is gitignored, so `npm run prisma:generate` is required after cloning and after any schema change. It sits inside `src/` because `tsconfig.build.json` sets `rootDir: ./src` and `nest build` rejects imports from outside it; `.oxlintrc.json` ignores `src/generated/**`.

`PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient` and connects/disconnects on the Nest lifecycle hooks. `PrismaModule` is `@Global()`, so injecting `PrismaService` needs no import in feature modules.

**Authentication.** Two global guards are registered by `AuthModule` via `APP_GUARD`, in order: `JwtAuthGuard` then `RolesGuard`. Every route is therefore protected by default — opt out with `@Public()`. `JwtAuthGuard` requires a `Bearer` token signed with `JWT_SECRET`, rejects a payload missing `sub` / `tenantId` / `role`, and attaches `{ userId, tenantId, role }` to the request; read it with `@CurrentUser()`. `RolesGuard` enforces `@Roles(Role.Admin, ...)` and allows any authenticated role when a route declares none. `AuthModule` throws at import time if `JWT_SECRET` is unset, so the app never starts with an unsigned-token hole.

**Refresh tokens.** The access token is short-lived (`JWT_EXPIRES_IN`, 15m) and the refresh token is opaque: 32 random bytes, stored in `refresh_tokens` as a SHA-256 hash, never in clear. `RefreshTokensService.consume` rotates on every use — the presented token is revoked and linked to its replacement through `replaced_by_id`. Replaying an already-revoked token revokes **every** active token of that user, on the assumption that a revoked token in circulation means it was stolen.

`POST /auth/logout` **deletes** the row rather than revoking it, so nothing is left for an attacker to replay. The delete is scoped to the authenticated user, so presenting someone else's refresh token deletes nothing, and logging out twice still answers `204` — the response never says whether the token existed. One consequence of deleting instead of revoking: a logged-out token that later reappears looks unknown rather than revoked, so it does not trigger the stolen-token sweep that a replayed rotated token does. A refresh re-reads the user, so a soft-deleted user cannot refresh and a role change takes effect on the next refresh rather than waiting out the old token.

Passwords are hashed by `PasswordService` with `scrypt` from `node:crypto` — no native dependency. The stored format is `scrypt:<salt>:<key>`, a fresh 16-byte salt per password, compared with `timingSafeEqual`. `verify` returns `false` for a malformed hash instead of throwing.

Guards never derive the tenant from the request body or URL — only from the token.

**Tenant scoping is enforced, not just conventional.** `createTenantClient` (`src/prisma/tenant-client.ts`) is a Prisma client extension that injects `tenantId` into the `where` of every filtered operation and into the `data` of every create, for every model except `Tenant` (the only one without the column). A `tenantId` the caller tries to force is overridden, not merged. Inject it as `TENANT_PRISMA` — a `Scope.REQUEST` provider that reads the tenant from the authenticated request and throws if there is none, so it must never be injected into a `@Public()` route's service.

Use `TENANT_PRISMA` for anything that touches tenant data. The raw `PrismaService` crosses tenants by design and belongs only to code that legitimately has no tenant yet: login, refresh, and the seed.

**CORS.** `main.ts` calls `enableCors(corsOptions())`. The allowed origins come from `CORS_ORIGINS`, a comma-separated list — the CRM and the client portal are separate origins, so both go there. An unlisted browser origin is denied by omitting the CORS headers (`callback(null, false)`), never by raising an error, which would turn into a 500. A request with no `Origin` header (curl, the Z-API webhook, server-to-server) is allowed, since CORS only governs browsers. With `CORS_ORIGINS` unset, every browser origin is refused.

**Logging.** Every authentication and user-creation outcome is logged through Nest's `Logger`, which `ObserveModule` ships to NestJS Observe with a trace id. Successes are `log`, rejections are `warn`: `AuthService` logs a successful login (user id, role, tenant) and a failed one (email, tenant, and whether the user was unknown or the password wrong); `UsersService` logs a created user and a rejected duplicate email; `JwtAuthGuard` and `RolesGuard` log the rejected method, path and reason.

The reason for a rejection goes to the log, never to the client: `JwtAuthGuard` answers a flat `401 Unauthorized` whether the token is missing, forged or expired, so the response cannot be used to probe what is wrong with a token. A log line must never carry a password, a password hash or a token — there is a test asserting that.

**WhatsApp (Z-API).** Each tenant has exactly one row in `phones`, whose primary key *is* `tenant_id`, holding that firm's Z-API `instanceId`, `token` and `clientToken`. Nothing is global: a tenant with no row cannot send, and an instance that belongs to nobody cannot deliver.

`ZApiClient.sendText` posts to `https://api.z-api.io/instances/{instanceId}/token/{token}/send-text` with the `Client-Token` header and `{ phone, message }`, per https://developer.z-api.io/message/send-text.md. Any provider failure becomes a `503`, and the message is stored **only after** Z-API accepts it, so the table never claims a message that was never sent.

`POST /webhooks/z-api/:instanceId/:token/received` is `@Public()` — Z-API cannot authenticate. The instance and token in the path are the credential: they are matched against a `phones` row, and that row decides the tenant. An unknown pair answers `404` and stores nothing. Z-API only calls HTTPS webhooks, so this needs a public TLS URL in production. Register it with `PUT /instances/{id}/token/{token}/update-webhook-received`.

An inbound message is attached to the `clients` row with that phone in the same tenant, or stored with `clientId = null` when the number is unknown. Callbacks with no text, or with `fromMe`, are acknowledged and ignored.

**Routes.** `POST /auth/login` is `@Public()` and takes `{ tenantId, email, password }`, answering `200 { accessToken, refreshToken }`. `POST /auth/refresh` is `@Public()` and takes `{ refreshToken }`, answering `200` with a fresh pair. `POST /auth/logout` requires authentication, takes `{ refreshToken }` and answers `204`. `POST /messages` is `@Roles(Role.Admin, Role.Lawyer)` and takes `{ phone, message }`, answering `201` with the stored message. `POST /auth/signup` is `@Roles(Role.Admin)` and takes `{ name, email, password, role }`, answering `201` with the created user minus its password hash — the tenant comes from the caller's token, and a `tenantId` sent in the body is ignored. `POST /webhooks/z-api/:instanceId/:token/received` is `@Public()` and answers `200`. `GET /` is `@Public()` and is the starter's hello route.

Request bodies are validated with Zod through `@Body({ schema })`. That only works because `AppModule` registers `StandardSchemaValidationPipe` as an `APP_PIPE`: without it the decorator's schema is silently ignored and invalid input reaches the database.

## Conventions

- This NestJS version is newer than training data. Check https://docs.nestjs.com/llms.txt before reaching for a third-party library — `AGENTS.md` lists the first-party packages (database, auth, queues, config, resilience, AI/MCP, …) that likely already cover the need.
- Validation: prefer `StandardSchemaValidationPipe` with `@Body({ schema })` / `@Param('id', { schema })` and a Standard Schema library (Zod, Valibot, ArkType) over `class-validator` decorators.
- For questions about production behavior (an error users hit, a slow endpoint, a regression after a release), work from Observe data rather than the code alone — see `AGENTS.md` for the Observe MCP server setup.

## Project rules

These are mandatory for every change in this repository.

1. **Tests first.** Write the unit test before implementing a feature or fixing a bug. For a bug, the test must fail for the reported reason before the fix and pass after it.
2. **English only.** All code, identifiers, test names, commit messages and documentation are written in English.
3. **No comments in code.** Names and tests carry the intent. Exception: a comment the user explicitly asks for.
4. **Never delete or modify an existing test** without asking the user first. Adding new tests is always allowed.
5. **Never assume or guess.** Every statement made to the user must be verified in the code (read the file, run the command). If something cannot be verified, say so explicitly instead of inferring.
6. **Tests must pass.** After any code change, run `npm test` (and `npm run test:e2e` when e2e specs are affected). If anything fails, fix it without asking the user — subject to rule 4 when the fix would touch an existing test.
7. **Business rule changes are documented here**, in the "Business rules" section below: what changed, and why.

## Business rules

### Seed data

`prisma/seed.ts` is idempotent and creates the tenant `Tenant Teste` with one admin, `adm@adm.com` / `adm` (role `ADMIN`). These are development credentials — they must never be seeded into a production database.

### Authentication rules

- A user is always identified by **tenant plus email**, never by email alone, because the same address may exist in several tenants. `POST /auth/login` therefore requires `tenantId`.
- Login only accepts users with `deleted = false`: a soft-deleted user cannot sign in.
- A failed login answers the same `401 Invalid credentials` whether the email does not exist or the password is wrong, so the endpoint cannot be used to discover which emails are registered.
- Only an `ADMIN` creates users, and only inside their own tenant. There is no public self-service sign-up, and no way to create a user in another tenant.
- Roles are `ADMIN`, `LAWYER` and `CLIENT` (`src/auth/role.enum.ts`). The column is a plain `varchar`, so the enum is enforced in application code only.
- A refresh does not write to `access_histories`; only a password login does.
- A successful login writes one `access_histories` row with `operation = LOGIN`, the user and their tenant. A failed login writes nothing, so the table is a record of granted access, not of attempts. The write happens before the token is signed: if it fails, the login fails.

### Messaging rules

- A tenant can only send WhatsApp through its own `phones` row; there is no shared or fallback instance. A tenant without one gets `404`.
- An outbound message is stored **only after** Z-API accepts it, so `messages` never claims something that was not sent. A provider failure answers `503`.
- An inbound message is attributed to the tenant that owns the instance in the webhook URL — never to a tenant named in the payload.
- A message from a number that matches no `clients` row is still stored, with `clientId = null`. Messages are not dropped for being from a stranger.
- Callbacks with no text, or with `fromMe`, are acknowledged with `200` and ignored. Answering `200` matters: a non-2xx makes Z-API retry.
- `messages.direction` holds `INBOUND` or `OUTBOUND` from `MessageDirection` (`src/messaging/message-direction.enum.ts`), as a `varchar` like every other enum here.

### Initial schema (migration `init`)

Seven tables, all tenant-partitioned except `tenants` itself: `tenants`, `users`, `clients`, `services`, `invoices`, `transactions`, `access_histories`. Every table except `access_histories` carries the soft-delete and audit quartet `deleted` / `created_at` / `updated_at` / `deleted_at`; `access_histories` is append-only and has only `created_at`.

- Money (`value`, `balance` on `services`, `invoices`, `transactions`) is stored as `int`, so it is a minor unit (cents). Never write a decimal amount to these columns.
- `services` and `invoices` carry both `canceled` and `canceled_at`, separate from the soft-delete flags: cancelling is a business state, deleting is not.
- `transactions.operation` is a free `varchar`, not an enum — the allowed values are enforced in application code.
- `transactions.client_id` is required, while its `invoice_id` and `service_id` are optional: a transaction always belongs to a client and may settle an invoice, a service, or neither.
- `users.email` is unique **per tenant** (`users_tenant_id_email_key` on `tenant_id, email`), not globally. The same address may exist in more than one law firm, so a user is never looked up by email alone — always by email **plus** tenant. The constraint ignores soft deletes: a soft-deleted user keeps its email reserved inside that tenant.
- `updated_at` is `NOT NULL DEFAULT now()` and is maintained by Prisma's `@updatedAt`, so it bumps on every `update` through the client. It is application-level, not a database trigger: a write that bypasses Prisma (`$executeRaw`, psql, a migration) will not bump it.
- `deleted` and `canceled` are `NOT NULL DEFAULT false`, so `where deleted = false` is safe — there are no `NULL`s to account for.

Changed by migration `required_flags_and_shared_email` (2026-11-06): dropped the global `users_email_key`, and made `deleted`, `canceled` and `updated_at` required across every table that has them.

Changed by migration `unique_email_per_tenant` (2026-11-06): added `@@unique([tenantId, email])` on `users`.

Changed by migration `phones_and_messages` (2026-11-06): added `phones` (one Z-API instance per tenant, `tenant_id` as the primary key, `instance_id` unique) and `messages` (direction `INBOUND`/`OUTBOUND` from `MessageDirection`, the counterpart phone, the text, the Z-API message id, and an optional client). Z-API credentials are stored in clear — they are reversible secrets, not hashes — so the `phones` table deserves encryption at rest before production.

Changed by migration `refresh_tokens` (2026-11-06): added the `refresh_tokens` table (hash, user, tenant, expiry, revocation and `replaced_by_id` rotation chain).

Changed by migration `access_history_operation` (2026-11-06): added `access_histories.operation` (`varchar(255)`, required). Its values come from `AccessOperation` (`src/access-histories/access-operation.enum.ts`), which currently holds only `LOGIN`. Like `users.role` and `transactions.operation`, the column is a plain `varchar` and the enum is enforced in application code, so adding a value needs no migration.

Migration folder names must be UTC timestamps, so a hand-made folder sorts after the existing ones — Prisma applies migrations in lexicographic order, and a local-time name can silently sort before the migration it depends on.
