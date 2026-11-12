import "dotenv/config";
import { createWorkers } from "./worker.js";
async function bootstrap(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url || !["redis:", "rediss:"].includes(new URL(url).protocol))
    throw new Error("REDIS_URL is required");
  const runtime = await createWorkers(url);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void runtime.close().catch(() => {
      console.error("Worker shutdown failed");
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  console.log(
    JSON.stringify({ event: "worker.ready", queues: runtime.workers.length }),
  );
}
void bootstrap().catch(() => {
  console.error("Worker startup failed. Check Redis and environment settings.");
  process.exitCode = 1;
});
