import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: "/mnt/g/docflow-ai/.env" });

async function main() {
  const connectionString = process.env.DATABASE_URL?.replaceAll('"', "");
  if (!connectionString) throw new Error("DATABASE_URL missing");

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // ensure a system user exists (you can change email)
  const systemEmail = "system@docflow.ai";
  const systemUser = await prisma.user.upsert({
    where: { email: systemEmail },
    update: {},
    create: { email: systemEmail, name: "System" }
  });

  const res = await prisma.document.updateMany({
    where: { userId: null },
    data: { userId: systemUser.id }
  });

  console.log({ backfilled: res.count, systemUserId: systemUser.id });

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
