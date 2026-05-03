import "dotenv/config";
import { createGenerateLetterWorker } from "./workers/generate-letter.worker";
import { createSendEmailWorker } from "./workers/send-email.worker";
import { prisma } from "./lib/db";
import { closeAllRedisConnections } from "./lib/redis";

const DRAIN_TIMEOUT_MS = 30_000;

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

  async function shutdown(signal: string) {
    console.log(`[worker] Received ${signal}, draining workers...`);

    const timer = setTimeout(() => {
      console.error("[worker] Drain timeout exceeded, forcing exit");
      process.exit(1);
    }, DRAIN_TIMEOUT_MS);

    try {
      await Promise.all([generateWorker.close(), sendWorker.close()]);
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
