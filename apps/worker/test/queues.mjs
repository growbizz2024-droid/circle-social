import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createWorkers } from "../dist/worker.js";
const prefix = `circle-test-${randomUUID()}`;
const url = process.env.REDIS_URL;
await test("worker processes health jobs, rejects unknown jobs, and shuts down gracefully", async () => {
  const runtime = await createWorkers(url, prefix);
  const queue = new Queue("maintenance", { connection: { url }, prefix });
  const events = new QueueEvents("maintenance", {
    connection: { url },
    prefix,
  });
  try {
    await events.waitUntilReady();
    assert.equal(await runtime.health(), true);
    const job = await queue.add("healthcheck", {}, { attempts: 3 });
    assert.deepEqual(await job.waitUntilFinished(events, 10000), {
      status: "ok",
    });
    const rejected = await queue.add("unregistered", {}, { attempts: 3 });
    await assert.rejects(() => rejected.waitUntilFinished(events, 10000));
    assert.equal(await rejected.getState(), "failed");
  } finally {
    await runtime.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
});
await test("retry and exponential backoff retain terminal failures", async () => {
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  connection.on("error", () => {});
  const name = "retry-fixture";
  const queue = new Queue(name, { connection: { url }, prefix });
  const events = new QueueEvents(name, { connection: { url }, prefix });
  const worker = new Worker(
    name,
    async (job) => {
      if (job.name === "always-fail" || job.attemptsMade < 1)
        throw new Error("fixture failure");
      return "recovered";
    },
    { connection, prefix },
  );
  try {
    await events.waitUntilReady();
    const job = await queue.add(
      "fail-once",
      {},
      { attempts: 3, backoff: { type: "exponential", delay: 20 } },
    );
    assert.equal(await job.waitUntilFinished(events, 10000), "recovered");
    const failure = await queue.add(
      "always-fail",
      {},
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 20 },
        removeOnFail: false,
      },
    );
    await assert.rejects(() => failure.waitUntilFinished(events, 10000));
    assert.equal((await queue.getJob(failure.id)).attemptsMade, 2);
  } finally {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  }
});
