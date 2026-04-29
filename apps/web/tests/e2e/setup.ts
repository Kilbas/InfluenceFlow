import { execSync } from "node:child_process";

export default async function globalSetup() {
  const env = {
    ...process.env,
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
    ADMIN_INIT_EMAIL: "owner@test.com",
    ADMIN_INIT_PASSWORD: "test1234",
    WORKSPACE_NAME: "E2E",
  };
  execSync("pnpm prisma migrate reset --force", { stdio: "inherit", env, cwd: __dirname + "/../.." });
  execSync("pnpm prisma db seed", { stdio: "inherit", env, cwd: __dirname + "/../.." });
}
