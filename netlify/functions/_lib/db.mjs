import { getConnectionString } from '@netlify/database';
import postgres from 'postgres';

let client;

export function db() {
  if (!client) {
    // GitHub Actions integration tests use an ephemeral PostgreSQL service.
    // Netlify preview and production always use their own managed connection.
    const testConnection = process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL;
    client = postgres(testConnection || getConnectionString(), {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: { undefined: null }
    });
  }
  return client;
}
