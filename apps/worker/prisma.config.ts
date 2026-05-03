import path from "node:path";
import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: path.join(import.meta.dirname, "../web/prisma/schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
