import { prisma } from "./client";

async function main() {
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("db ok:", result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
