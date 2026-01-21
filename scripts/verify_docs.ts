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

  const docs = await prisma.document.findMany({
    take: 10,
    orderBy: { createdAt: "desc" }
  });

  console.log(docs);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
