# Development workflow

Start with README setup. Applications retain framework-specific TypeScript settings; shared packages and worker use Node16 module resolution. Do not globally replace Expo settings with a Node compiler configuration. pnpm 10.34.9 and TypeScript 6.0.3 are intentional pins.

## Quality commands

```sh
pnpm install --frozen-lockfile
pnpm brand:assets
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm security:secrets
pnpm audit --prod --audit-level high
```

Build compiles shared packages, generates Prisma, builds Nest/worker/web, and exports iOS/Android Hermes bundles. It does not sign native binaries or publish apps. Expo needs permission to access its local state/cache directory and spawn Metro workers. The web production command uses `next build --webpack`. No font download should be needed.

Integration tests use a separate test database and disposable queue prefixes; do not point tests at production. `pnpm --filter api db:test:prepare` prepares only the local `_test` database. The Redis worker test never flushes the instance. Test queue cleanup is limited to the generated test prefix.

## Infrastructure lifecycle

Use only the root `infra:up` and `infra:down` scripts or the explicit Compose file with `--env-file`. Never use the `ads_*` Compose project. `down` preserves Circle.social volumes; restart to verify persistence. `docker ps` should show all four original/new services healthy. Database/Redis authentication must be tested separately from container health. Use container-local environment variables rather than pasting passwords on the host command line.

## Git and CI

Work on a branch; review source, lockfile and migration SQL together. Run the secret scanner before staging and inspect `git diff --cached --stat`. Generated clients, bundles, `.env` files and backups are excluded. Use coherent commits and open a pull request. Quality CI runs installation, migrations, builds, typechecks, lint, unit/integration tests and dependency audits. Security CI runs redacted Gitleaks and pinned container vulnerability scans. Actions are pinned by commit; Dependabot opens update PRs.

The GitHub repository must require successful `quality` and `scan` checks on main, require pull requests, and disallow force pushes/deletions. Workflow files alone do not enforce branch protection. The initial bootstrap push necessarily precedes the first GitHub Actions run. Do not claim hosted CI passed until run results are inspected.

## Troubleshooting

- `pnpm install` without a TTY: rerun interactively, or `CI=true` in actual CI. Do not change package versions to fix terminal access.
- Missing Prisma client: `pnpm --filter api db:generate`; build shared packages first.
- `DATABASE_URL` missing during generation: run `pnpm env:setup` or supply the CI datasource. Configuration is loaded in the API working directory.
- Readiness 503: inspect Circle.social health and local environment privately. Do not paste `.env` files or expanded Compose configuration.
- Turbopack process/port failure: Webpack is the documented production fallback; do not weaken host security controls.
- Passkey origin mismatch: use the exact configured `http://localhost:3000`; `127.0.0.1` is a different WebAuthn origin. Native clients need separately configured origins/association.
- Native builds: install platform toolchains or use Expo build services. Export success is not an app store release test.

`node infrastructure/scripts/verify-persistence.mjs` writes disposable probes only to the test database and a dedicated Redis key, performs a Circle.social-only Compose down/up cycle, verifies the probes survived, cleans them up, and confirms `ads_*` container start times were unchanged. Run this only when temporary downtime of Circle.social is acceptable. It is not part of every unit test run.

See [User identity](user-identity.md) for Milestone 1.1 profile contracts, local browser-to-mobile authentication, native toolchain requirements and browser E2E setup.
