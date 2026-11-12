# Dependency findings

Production dependency audit on 2026-11-03 found zero high/critical advisories and two moderate advisories:

- [minimatch globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249), fixed in 11.0.1. The current framework toolchains still depend on older major versions.
- [glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), fixed in 14.0.2. Expo CLI/configuration and the Sentry dependency graph currently include older majors.

No Circle.social endpoint accepts glob patterns or filesystem traversal parameters. The practical exposure appears concentrated in tooling/configuration paths; this is an application code inspection, not proof that every transitive path is unreachable. Do not process untrusted repositories, glob patterns or filesystem trees in the application. CI fails on high/critical findings and retains audit visibility; moderate findings are not suppressed. Track upstream framework updates through Dependabot instead of forcing incompatible dependency-major overrides. Reassess before production exposure or adding any file/glob-based feature.
