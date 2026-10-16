import { getConnectionString } from '@netlify/database';
import postgres from 'postgres';

let client;

export function db() {
  if (!client) {
    client = postgres(getConnectionString(), {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: { undefined: null }
    });
  }
  return client;
}
