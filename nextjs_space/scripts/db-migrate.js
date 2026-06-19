// Startup migration: adds columns/tables that may not yet exist in the production DB.
// Safe to re-run; IF NOT EXISTS makes each statement idempotent.
const { PrismaClient } = require('@prisma/client');

async function main() {
  const db = new PrismaClient();
  try {
    // Existing render columns
    await db.$executeRawUnsafe(
      `ALTER TABLE "Flipbook" ADD COLUMN IF NOT EXISTS "renderStatus" TEXT NOT NULL DEFAULT 'pending'`
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "Flipbook" ADD COLUMN IF NOT EXISTS "renderedPageCount" INTEGER NOT NULL DEFAULT 0`
    );

    // Folder table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Folder" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "name"      TEXT NOT NULL,
        "userId"    TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Folder_userId_idx" ON "Folder"("userId")`
    );

    // folderId FK on Flipbook
    await db.$executeRawUnsafe(
      `ALTER TABLE "Flipbook" ADD COLUMN IF NOT EXISTS "folderId" TEXT`
    );

    // Add FK constraint only if not already present
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'Flipbook_folderId_fkey'
        ) THEN
          ALTER TABLE "Flipbook"
            ADD CONSTRAINT "Flipbook_folderId_fkey"
            FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    // Add User FK on Folder only if not already present
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'Folder_userId_fkey'
        ) THEN
          ALTER TABLE "Folder"
            ADD CONSTRAINT "Folder_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    console.log('[startup] DB schema verified');
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error('[startup] Migration failed:', e.message);
  process.exit(1);
});
