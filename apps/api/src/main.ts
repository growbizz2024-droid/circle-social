import { shutdownMonitoring } from './core/monitoring.js';
import { createApplication } from './app.js';
import { environment } from './core/environment.js';
const app = await createApplication();
try {
  await app.listen(environment.PORT, environment.HOST);
} catch {
  await app.close();
  await shutdownMonitoring();
  console.error(
    'API startup failed. Check dependency health and environment settings.',
  );
  process.exitCode = 1;
}
