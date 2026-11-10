// Test environment: separate database so tests never touch dev data.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://raudah:raudah@localhost:5432/raudah_gsms_test?schema=public";
process.env.APP_ENCRYPTION_KEY = "a".repeat(64);
process.env.NEXTAUTH_SECRET = "test-secret";
