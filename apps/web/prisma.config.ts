import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "@prisma/config";

// Prisma 7 does not auto-load .env — load it explicitly so DATABASE_URL is available
loadDotenv({ path: path.join(import.meta.dirname, ".env") });

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
