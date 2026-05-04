import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { processGenerateLetterJob } from "../lib/generate-letter";
import type { GenerateLetterJob } from "../lib/queue-types";

const CONCURRENCY = Number(process.env.GENERATE_CONCURRENCY ?? "3");

export function createGenerateLetterWorker(): Worker<GenerateLetterJob> {
  const worker = new Worker<GenerateLetterJob>(
    "generate-letter",
    (job: Job<GenerateLetterJob>) => processGenerateLetterJob(job.data.sentEmailId),
    {
      connection: createRedisConnection(),
      concurrency: CONCURRENCY,
    }
  );

  worker.on("completed", (job) =>
    console.log(`[generate-letter] job ${job.id} completed`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[generate-letter] job ${job?.id} failed:`, err.message)
  );

  return worker;
}
