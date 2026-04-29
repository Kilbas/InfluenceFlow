import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: { reporter: ["text", "json"] },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
