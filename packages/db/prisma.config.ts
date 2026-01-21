import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load repo-root .env (because pnpm runs prisma from packages/db)
dotenv.config({ path: "/mnt/g/docflow-ai/.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL?.replaceAll('"', ""),
  },
});
