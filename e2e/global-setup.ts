import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_DB } from "../playwright.config";

/** Чистая база с реальным каталогом салона, владельцем admin/admin123 и мастером irina/irina123. */
export default async function globalSetup() {
  const env = { ...process.env, DATABASE_URL: E2E_DB };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  const db = new PrismaClient({ datasources: { db: { url: E2E_DB } } });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  execSync("npx tsx prisma/seed.ts", { env: { ...env, SEED_ADMIN_PASSWORD: "admin123" }, stdio: "inherit" });

  // график на 3 недели вперёд каждый день, чтобы тесты не зависели от дня недели
  const staff = await db.staff.findMany();
  await db.staffShift.deleteMany();
  const rows = [];
  for (let i = -1; i < 21; i++) {
    const d = new Date(Date.now() + 3 * 3_600_000 + i * 864e5).toISOString().slice(0, 10);
    for (const s of staff) rows.push({ staffId: s.id, date: d, start: "09:00", end: "21:00" });
  }
  await db.staffShift.createMany({ data: rows });
  const irina = await db.staff.findFirstOrThrow({ where: { name: "Ирина" } });
  await db.user.create({ data: { login: "irina", passwordHash: await bcrypt.hash("irina123", 10), role: "MASTER", staffId: irina.id } });
  await db.$disconnect();
}
