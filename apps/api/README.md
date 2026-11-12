# Circle.social API

NestJS modular API with Prisma 7/PostgreSQL, Redis/BullMQ, passkey authentication, opaque sessions, and health checks.

Run setup from the monorepo root following [the project README](../../README.md). API defaults to `127.0.0.1:3001`. See [API conventions](../../docs/api/conventions.md), [database workflow](../../docs/database/development.md), and [authentication security](../../docs/security/authentication.md).

Use `pnpm --filter api dev` for local development and `pnpm --filter api start:prod` after the workspace build. `pnpm --filter api test:integration` requires the isolated Circle.social infrastructure and test environment. No production telemetry is exported unless explicitly configured.
