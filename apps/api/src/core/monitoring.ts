import 'dotenv/config';
import { Registry, Counter, Histogram } from 'prom-client';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import * as Sentry from '@sentry/node';
export const registry = new Registry();
const requests = new Counter({
  name: 'circle_http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'status'],
  registers: [registry],
});
const duration = new Histogram({
  name: 'circle_http_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 5],
  registers: [registry],
});
let sdk: NodeSDK | undefined;
// Exporters are opt-in. No user identifiers, cookies, payloads, or URLs are attached.
if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
  sdk = new NodeSDK({
    serviceName: 'circle-api',
    autoDetectResources: false,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    }),
    instrumentations: [],
  });
  sdk.start();
}
if (process.env.SENTRY_DSN)
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    defaultIntegrations: false,
    beforeSend: (event) => ({
      type: undefined,
      event_id: event.event_id,
      level: event.level,
      message: 'API internal error',
    }),
  });
export function beginRequest(method: string) {
  const safeMethod = [
    'GET',
    'POST',
    'DELETE',
    'PUT',
    'PATCH',
    'OPTIONS',
    'HEAD',
  ].includes(method)
    ? method
    : 'OTHER';
  const started = performance.now();
  const span = trace
    .getTracer('circle-api')
    .startSpan('http.request', {
      attributes: { 'http.request.method': safeMethod },
    });
  return (status: number) => {
    requests.inc({ method: safeMethod, status });
    duration.observe(
      { method: safeMethod, status },
      (performance.now() - started) / 1000,
    );
    span.setAttribute('http.response.status_code', status);
    if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  };
}
export function reportInternalError(): void {
  if (process.env.SENTRY_DSN)
    Sentry.captureMessage('API internal error', 'error');
}
export async function shutdownMonitoring(): Promise<void> {
  await sdk?.shutdown();
  if (process.env.SENTRY_DSN) await Sentry.close(2000);
}
