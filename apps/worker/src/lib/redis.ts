import IORedis from "ioredis";

const connections: IORedis[] = [];

export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  const conn = new IORedis(url, { maxRetriesPerRequest: null });
  connections.push(conn);
  return conn;
}

export async function closeAllRedisConnections(): Promise<void> {
  await Promise.all(connections.map((c) => c.quit()));
  connections.length = 0;
}
