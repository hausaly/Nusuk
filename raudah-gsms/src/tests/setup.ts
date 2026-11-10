// Test environment: separate database + storage so tests never touch dev data.
import os from "node:os";
import path from "node:path";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://raudah:raudah@localhost:5432/raudah_gsms_test?schema=public";
process.env.APP_ENCRYPTION_KEY = "a".repeat(64);
process.env.NEXTAUTH_SECRET = "test-secret";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "raudah-test-storage");
delete process.env.USE_QUEUE;
delete process.env.ANTHROPIC_API_KEY;
