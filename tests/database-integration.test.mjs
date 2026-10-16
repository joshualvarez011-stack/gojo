import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';

const connectionString = process.env.TEST_DATABASE_URL || '';
const skipDatabase = !connectionString;
let sql;

before(async () => {
  if (skipDatabase) return;
  sql = postgres(connectionString, { max: 1 });
});

after(async () => {
  if (sql) await sql.end({ timeout: 2 });
});

test('migration seeds GOJO core data', { skip: skipDatabase }, async () => {
  const [restaurant] = await sql`
    select r.slug, l.slug as location_slug, br.slot_interval_minutes
    from restaurants r
    join locations l on l.restaurant_id = r.id
    join booking_rules br on br.location_id = l.id
    where r.slug = 'gojo' and l.slug = 'stockholm'
  `;

  assert.equal(restaurant.slug, 'gojo');
  assert.equal(restaurant.location_slug, 'stockholm');
  assert.equal(restaurant.slot_interval_minutes, 30);

  const [{ count }] = await sql`
    select count(*)::int as count
    from dining_tables
    where location_id = '22222222-2222-4222-8222-222222222222'
  `;
  assert.equal(count, 7);
});

test('database rejects overlapping active assignments on the same table', { skip: skipDatabase }, async () => {
  const [tableRow] = await sql`
    select id from dining_tables
    where location_id = '22222222-2222-4222-8222-222222222222' and code = 'T1'
  `;

  const startA = '2026-11-06T18:00:00+01:00';
  const endA = '2026-11-06T20:00:00+01:00';
  const startB = '2026-11-06T19:00:00+01:00';
  const endB = '2026-11-06T21:00:00+01:00';

  const [r1] = await sql`
    insert into reservations (
      restaurant_id, location_id, confirmation_code, manage_token_hash,
      guest_name, guest_phone, party_size, starts_at, ends_at, status, source
    ) values (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'DBTEST-A', 'dbtest-token-a', 'Test A', '+46700000001', 2,
      ${startA}, ${endA}, 'confirmed', 'web'
    ) returning id
  `;

  await sql`
    insert into reservation_table_assignments (reservation_id, table_id, during, active)
    values (${r1.id}, ${tableRow.id}, tstzrange(${startA}, ${endA}, '[)'), true)
  `;

  const [r2] = await sql`
    insert into reservations (
      restaurant_id, location_id, confirmation_code, manage_token_hash,
      guest_name, guest_phone, party_size, starts_at, ends_at, status, source
    ) values (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'DBTEST-B', 'dbtest-token-b', 'Test B', '+46700000002', 2,
      ${startB}, ${endB}, 'confirmed', 'web'
    ) returning id
  `;

  await assert.rejects(
    () => sql`
      insert into reservation_table_assignments (reservation_id, table_id, during, active)
      values (${r2.id}, ${tableRow.id}, tstzrange(${startB}, ${endB}, '[)'), true)
    `,
    (error) => error?.code === '23P01'
  );
});

test('adjacent assignments are allowed because ranges are half-open', { skip: skipDatabase }, async () => {
  const [tableRow] = await sql`
    select id from dining_tables
    where location_id = '22222222-2222-4222-8222-222222222222' and code = 'T2'
  `;

  const rows = [
    ['DBTEST-C', 'dbtest-token-c', '2026-11-07T17:00:00+01:00', '2026-11-07T19:00:00+01:00'],
    ['DBTEST-D', 'dbtest-token-d', '2026-11-07T19:00:00+01:00', '2026-11-07T21:00:00+01:00'],
  ];

  for (const [code, token, startsAt, endsAt] of rows) {
    const [reservation] = await sql`
      insert into reservations (
        restaurant_id, location_id, confirmation_code, manage_token_hash,
        guest_name, guest_phone, party_size, starts_at, ends_at, status, source
      ) values (
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        ${code}, ${token}, 'Adjacent Test', '+46700000003', 2,
        ${startsAt}, ${endsAt}, 'confirmed', 'web'
      ) returning id
    `;

    await sql`
      insert into reservation_table_assignments (reservation_id, table_id, during, active)
      values (${reservation.id}, ${tableRow.id}, tstzrange(${startsAt}, ${endsAt}, '[)'), true)
    `;
  }

  const [{ count }] = await sql`
    select count(*)::int as count
    from reservation_table_assignments
    where table_id = ${tableRow.id} and active = true
  `;
  assert.equal(count, 2);
});
