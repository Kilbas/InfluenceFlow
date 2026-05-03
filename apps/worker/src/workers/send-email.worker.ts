import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { prisma } from "../lib/db";
import type { SendEmailJob } from "../lib/queue-types";

const CONCURRENCY = Number(process.env.SEND_CONCURRENCY ?? "2");

async function processSendEmail(job: Job<SendEmailJob>): Promise<void> {
  const { sentEmailId } = job.data;

  const sentEmail = await prisma.sentEmail.findUnique({
    where: { id: sentEmailId },
    select: { id: true, status: true },
  });

  if (!sentEmail) {
    console.warn(`[send-email] sentEmail ${sentEmailId} not found, skipping`);
    return;
  }

  if (sentEmail.status !== "approved") {
    console.log(
      `[send-email] sentEmail ${sentEmailId} has status=${sentEmail.status}, skipping (idempotent no-op)`
    );
    return;
  }

  // M6 will implement actual SMTP send here.
  console.log(`[send-email] TODO(M6): send email for sentEmail ${sentEmailId}`);
}

export function createSendEmailWorker(): Worker<SendEmailJob> {
  const worker = new Worker<SendEmailJob>(
    "send-email",
    processSendEmail,
    {
      connection: createRedisConnection(),
      concurrency: CONCURRENCY,
    }
  );

  worker.on("completed", (job) =>
    console.log(`[send-email] job ${job.id} completed`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[send-email] job ${job?.id} failed:`, err.message)
  );

  return worker;
}
