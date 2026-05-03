import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { prisma } from "../lib/db";
import type { GenerateLetterJob } from "../lib/queue-types";

const CONCURRENCY = Number(process.env.GENERATE_CONCURRENCY ?? "3");

async function processGenerateLetter(job: Job<GenerateLetterJob>): Promise<void> {
  const { sentEmailId } = job.data;

  const sentEmail = await prisma.sentEmail.findUnique({
    where: { id: sentEmailId },
    select: { id: true, status: true },
  });

  if (!sentEmail) {
    console.warn(`[generate-letter] sentEmail ${sentEmailId} not found, skipping`);
    return;
  }

  if (sentEmail.status !== "queued") {
    console.log(
      `[generate-letter] sentEmail ${sentEmailId} has status=${sentEmail.status}, skipping (idempotent no-op)`
    );
    return;
  }

  // M5 will implement actual LLM generation here.
  console.log(`[generate-letter] TODO(M5): generate letter for sentEmail ${sentEmailId}`);
}

export function createGenerateLetterWorker(): Worker<GenerateLetterJob> {
  const worker = new Worker<GenerateLetterJob>(
    "generate-letter",
    processGenerateLetter,
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
