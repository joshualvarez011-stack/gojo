import postgres from 'postgres';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required to apply the integration-test migrations.');
}

const migrationDir = path.resolve('netlify/database/migrations');
const sql = postgres(connectionString, { max: 1 });

try {
  const migrations = (await readdir(migrationDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name)
    .sort();

  if (!migrations.length) throw new Error('No SQL migrations found.');

  for (const migration of migrations) {
    await sql.file(path.join(migrationDir, migration));
    console.log(`Applied ${migration}`);
  }
} finally {
  await sql.end({ timeout: 2 });
}
