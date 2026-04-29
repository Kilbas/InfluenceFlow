import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/password";
import { randomBytes } from "node:crypto";

// Prisma 7 / tsx: resolve .env relative to the apps/web root (one level up from prisma/)
loadDotenv({ path: path.resolve(__dirname, "../.env") });

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createClient();

async function main() {
  const adminEmail = process.env.ADMIN_INIT_EMAIL;
  const workspaceName = process.env.WORKSPACE_NAME ?? "Default Workspace";

  if (!adminEmail) {
    console.error("ADMIN_INIT_EMAIL is required for first-run seed");
    process.exit(1);
  }

  const existing = await prisma.workspace.findFirst();
  if (existing) {
    console.log(`Workspace already exists (${existing.id}). Skipping seed.`);
    return;
  }

  const tempPassword = process.env.ADMIN_INIT_PASSWORD ?? randomBytes(12).toString("base64url");
  const hash = await hashPassword(tempPassword);

  const workspace = await prisma.workspace.create({ data: { name: workspaceName } });
  const owner = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: adminEmail,
      passwordHash: hash,
      displayName: adminEmail.split("@")[0],
      role: Role.owner,
    },
  });

  console.log("");
  console.log("==========================================");
  console.log("InfluenceFlow first-run bootstrap complete");
  console.log("==========================================");
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`Owner:     ${owner.email}`);
  console.log(`Temporary password: ${tempPassword}`);
  console.log("Sign in and change your password immediately.");
  console.log("==========================================");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
