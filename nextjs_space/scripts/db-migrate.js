// Startup migration: adds columns that may not yet exist in the production DB.
// Safe to re-run; IF NOT EXISTS makes each statement idempotent.
const { PrismaClient } = require('@prisma/client');

async function main() {
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "Flipbook" ADD COLUMN IF NOT EXISTS "renderStatus" TEXT NOT NULL DEFAULT 'pending'`
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "Flipbook" ADD COLUMN IF NOT EXISTS "renderedPageCount" INTEGER NOT NULL DEFAULT 0`
    );
    console.log('[startup] DB columns verified');
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error('[startup] Migration failed:', e.message);
  process.exit(1);
});
