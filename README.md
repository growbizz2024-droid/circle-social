# Circle.social

India-first pseudonymous community conversations. This repository contains the Phase 0 development foundation; it is not a launched social network.

## Prerequisites

Node.js 24.22.2, pnpm 10.34.9, Git, and Docker Desktop with Compose. Node is pinned in `.nvmrc`. iOS/Android exports below are JavaScript/Hermes bundles, not signed store releases.

## First setup

```sh
nvm use
pnpm install --frozen-lockfile
pnpm brand:assets
pnpm env:setup
pnpm infra:up
pnpm --filter api db:deploy
pnpm --filter @circle/constants --filter @circle/validation build
pnpm --filter api db:seed
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm security:secrets
```

`env:setup` generates independent local credentials with private file permissions, verifies Git ignores, and never overwrites existing environment files. All databases and queues belong to Circle.social. Ports 5432 and 6379 and the existing `ads_*` containers are not touched.

## Run applications

```sh
pnpm --filter api dev
pnpm --filter web dev
pnpm --filter mobile dev
pnpm --filter @circle/worker dev
```

Run each command in its own terminal, or `pnpm dev` for Turbo's combined development sessions. Web uses port 3000; API binds to 127.0.0.1:3001. Infrastructure exposes PostgreSQL at 127.0.0.1:5433 and Redis at 127.0.0.1:6380. Passkey development uses the exact origin `http://localhost:3000` and RP ID `localhost`.

- API readiness: `http://127.0.0.1:3001/v1/health/ready`
- Liveness: `/v1/health/live`
- Prometheus metrics: `/v1/health/metrics` (keep internal)
- Local API documentation: `http://127.0.0.1:3001/docs`

The production web build explicitly uses Webpack because this execution environment restricts Turbopack process/port creation. There is no Google Fonts network dependency.

## Repository

- `apps/web`: Next.js App Router application.
- `apps/mobile`: Expo/React Native application.
- `apps/api`: NestJS modular backend with Prisma, WebAuthn, sessions, queues, and health checks.
- `apps/worker`: BullMQ process; only a maintenance healthcheck processor is implemented.
- `packages/`: shared types, validation, API client, design tokens, constants, configuration.
- `infrastructure/`: isolated Docker resources, setup, backups, security checks, load testing.
- `docs/`: [architecture](docs/architecture/system.md), [database](docs/database/development.md), [API](docs/api/conventions.md), [security](docs/security/authentication.md), and [development](docs/workflows/development.md).

## Scope and outstanding product decisions

No posts, media upload, moderation business processors, or mobile passkey UI are implemented in Phase 0. The five canonical communities are seeded by `pnpm --filter api db:seed`; their public slugs are stable. Phase 1 adds pre-enrolled, single-use recovery credentials and complete onboarding; see [the onboarding contract](docs/workflows/onboarding.md). Without a saved recovery credential or a registered passkey, there is no liveness-only or support-based recovery bypass. See the security document before exposing authentication to users.

The shared [brand foundation](docs/design/brand.md) defines the logo, orange/black palette, locally bundled fonts and light/dark styling for web and mobile.

### Approximate login locations

Run `pnpm geoip:setup` to install the local DB-IP City Lite database. New sessions can show approximate city/country in private security history; localhost remains unavailable. See [trusted ingress configuration and privacy](infrastructure/geoip/README.md) before enabling web IP forwarding in a deployment.
