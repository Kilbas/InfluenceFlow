import "server-only";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export type GenerateLetterJob = { sentEmailId: string };
export type SendEmailJob = { sentEmailId: string };

function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

let _generateLetterQueue: Queue<GenerateLetterJob> | null = null;
let _sendEmailQueue: Queue<SendEmailJob> | null = null;

export function getGenerateLetterQueue(): Queue<GenerateLetterJob> {
  if (!_generateLetterQueue) {
    _generateLetterQueue = new Queue<GenerateLetterJob>("generate-letter", {
      connection: createRedisConnection(),
    });
  }
  return _generateLetterQueue;
}

export function getSendEmailQueue(): Queue<SendEmailJob> {
  if (!_sendEmailQueue) {
    _sendEmailQueue = new Queue<SendEmailJob>("send-email", {
      connection: createRedisConnection(),
    });
  }
  return _sendEmailQueue;
}
