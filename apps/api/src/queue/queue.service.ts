import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_DEFAULTS, type QueueName } from '@circle/constants';
import { environment } from '../core/environment.js';
@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly queues = new Map<QueueName, Queue>(
    QUEUE_NAMES.map((name) => [
      name,
      new Queue(name, {
        connection: { url: environment.REDIS_URL, maxRetriesPerRequest: 1 },
        prefix: 'circle-jobs',
        defaultJobOptions: JOB_DEFAULTS,
      }),
    ]),
  );
  constructor() {
    for (const queue of this.queues.values()) queue.on('error', () => {});
  }
  async health(): Promise<void> {
    await Promise.all(
      [...this.queues.values()].map((q) =>
        q.getJobCounts('waiting', 'active', 'failed'),
      ),
    );
  }
  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
