import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { createGenerateLetterWorker } from "./workers/generate-letter.worker";
import { createSendEmailWorker } from "./workers/send-email.worker";
import { prisma } from "./lib/db";
import { createRedisConnection, closeAllRedisConnections } from "./lib/redis";
import { deleteStaleWebContexts } from "./lib/web-context";

const DRAIN_TIMEOUT_MS = 30_000;
const CLEANUP_QUEUE = "web-context-cleanup";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  console.log("[worker] Starting InfluenceFlow worker...");

  const generateWorker = createGenerateLetterWorker();
  const sendWorker = createSendEmailWorker();

  console.log(
    `[worker] generate-letter worker running (concurrency=${process.env.GENERATE_CONCURRENCY ?? 3})`
  );
  console.log(
    `[worker] send-email worker running (concurrency=${process.env.SEND_CONCURRENCY ?? 2})`
  );

  // M5.1: daily cleanup of stale web_context rows (older than 90 days)
  const cleanupQueue = new Queue(CLEANUP_QUEUE, { connection: createRedisConnection() });
  await cleanupQueue.add("cleanup", {}, { repeat: { every: ONE_DAY_MS }, jobId: "daily-cleanup" });

  const cleanupWorker = new Worker(
    CLEANUP_QUEUE,
    async () => {
      const deleted = await deleteStaleWebContexts();
      console.log(`[web-context-cleanup] Deleted ${deleted} stale rows`);
    },
    { connection: createRedisConnection() }
  );
  console.log("[worker] web-context-cleanup cron registered (every 24h)");

  async function shutdown(signal: string) {
    console.log(`[worker] Received ${signal}, draining workers...`);

    const timer = setTimeout(() => {
      console.error("[worker] Drain timeout exceeded, forcing exit");
      process.exit(1);
    }, DRAIN_TIMEOUT_MS);

    try {
      await Promise.all([
        generateWorker.close(),
        sendWorker.close(),
        cleanupWorker.close(),
        cleanupQueue.close(),
      ]);
      await prisma.$disconnect();
      await closeAllRedisConnections();
      clearTimeout(timer);
      console.log("[worker] Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      clearTimeout(timer);
      console.error("[worker] Error during shutdown:", err);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] Fatal startup error:", err);
  process.exit(1);
});
