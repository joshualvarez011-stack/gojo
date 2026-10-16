import postgres from 'postgres';
import path from 'node:path';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required to apply the integration-test migration.');
}

const sql = postgres(connectionString, { max: 1 });
try {
  const migrationPath = path.resolve('netlify/database/migrations/20261016003000_booking_core.sql');
  await sql.file(migrationPath);
  console.log('Applied booking_core migration to integration-test database.');
} finally {
  await sql.end({ timeout: 2 });
}
