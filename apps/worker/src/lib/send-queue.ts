import { Queue } from "bullmq";
import { createRedisConnection } from "./redis";
import type { SendEmailJob } from "./queue-types";

let _sendEmailQueue: Queue<SendEmailJob> | null = null;

export function getSendEmailQueue(): Queue<SendEmailJob> {
  if (!_sendEmailQueue) {
    _sendEmailQueue = new Queue<SendEmailJob>("send-email", {
      connection: createRedisConnection(),
    });
  }
  return _sendEmailQueue;
}
