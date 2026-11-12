import { Worker, UnrecoverableError, type Job } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAMES, type QueueName } from "@circle/constants";
export async function processFoundationJob(
  queue: QueueName,
  job: Job,
): Promise<{ status: string }> {
  if (queue === "maintenance" && job.name === "healthcheck")
    return { status: "ok" };
  throw new UnrecoverableError("No processor registered for this job type");
}
export async function createWorkers(redisUrl: string, prefix = "circle-jobs") {
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: 5000,
  });
  connection.on("error", () => {});
  await connection.connect();
  const workers = QUEUE_NAMES.map((name) => {
    const worker = new Worker(name, (job) => processFoundationJob(name, job), {
      connection,
      prefix,
      concurrency: 2,
    });
    worker.on("error", () =>
      console.error(JSON.stringify({ event: "worker.error", queue: name })),
    );
    worker.on("failed", (job) =>
      console.error(
        JSON.stringify({ event: "job.failed", queue: name, jobId: job?.id }),
      ),
    );
    return worker;
  });
  await Promise.all(workers.map((w) => w.waitUntilReady()));
  return {
    workers,
    health: async () => {
      await connection.ping();
      return workers.every((w) => w.isRunning());
    },
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
      await connection.quit();
    },
  };
}
