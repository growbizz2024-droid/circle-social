# Monitoring and performance foundation

`GET /v1/health/metrics` exposes request counts and duration histograms with bounded method/status labels. Prometheus should scrape it internally; Grafana can chart request rates, error fractions and p95 latency. No users, handles, IPs, request IDs, raw URLs or tokens are metric labels. Liveness/readiness are separate; readiness queries PostgreSQL, Redis and queue metadata.

OpenTelemetry request spans are enabled only when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is configured. No payloads or identifiers are attached. Sentry is enabled only when `SENTRY_DSN` is configured; automatic integrations are disabled and events are reduced to a generic internal-error message. With no opt-in settings, no telemetry is sent externally. Production exporters need access controls, retention, sampling, and review before real user traffic.

The optional monitoring Compose file runs Prometheus and Grafana on loopback ports 9090 and 3002 with independent persistence. It is not required for API/worker operation. The API must bind a host interface reachable by the Docker VM if scraping a host process; keep firewall/ingress restrictions in place. Do not expose metrics or Grafana anonymously.

A k6 smoke scenario lives in `infrastructure/scripts/load.js`: 5 virtual users for 20 seconds, readiness requests, <1% failures, p95 <500ms. This is a baseline test, not a production capacity claim. Run the API locally, then run k6 with the correct API_BASE_URL. Observe database query latency/pool use and Redis errors alongside API histograms. Increase load gradually with representative non-sensitive fixtures.

Before Socket.IO implementation, define auth, room authorization, fan-out sizes, message limits, reconnect storms and a WebSocket load scenario. Before production load testing, use a dedicated environment, establish cost limits, and exclude unrelated services.

```sh
docker compose --env-file infrastructure/docker/.env.monitoring -f infrastructure/docker/monitoring.compose.yml config --quiet
docker compose --env-file infrastructure/docker/.env.monitoring -f infrastructure/docker/monitoring.compose.yml up -d
```

Grafana uses user `admin` and the private generated monitoring password. Do not print or commit that environment file. Monitoring is opt-in; use the same explicit Compose invocation with `down` to stop it without removing its volumes.

Local baseline on 2026-11-03: 100 readiness requests at five virtual users over 20 seconds; 0 failures, p95 16.99 ms. This exercises an empty development database and is not evidence of production capacity. Use the pinned `grafana/k6:2.3.0` image with `--no-usage-report` for reproducibility.
