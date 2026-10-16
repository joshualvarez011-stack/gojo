import { db } from './db.mjs';

const RESTAURANT_SLUG = process.env.RESTAURANT_SLUG || 'gojo';
const LOCATION_SLUG = process.env.LOCATION_SLUG || 'stockholm';

export async function loadContext(sql = db()) {
  const [context] = await sql`
    SELECT r.id AS restaurant_id, r.slug AS restaurant_slug, r.name AS restaurant_name, r.timezone,
           r.phone, r.email, l.id AS location_id, l.name AS location_name,
           l.address_line1, l.postal_code, l.city,
           br.slot_interval_minutes, br.default_duration_minutes, br.buffer_before_minutes,
           br.buffer_after_minutes, br.min_party_size, br.max_online_party_size,
           br.large_party_threshold, br.min_lead_minutes, br.max_advance_days,
           br.grace_period_minutes, br.payment_mode, br.deposit_amount_minor, br.currency,
           br.is_development_default
      FROM restaurants r
      JOIN locations l ON l.restaurant_id = r.id AND l.slug = ${LOCATION_SLUG} AND l.active
      JOIN booking_rules br ON br.location_id = l.id
     WHERE r.slug = ${RESTAURANT_SLUG}
     LIMIT 1`;
  if (!context) throw Object.assign(new Error('Restaurangen är inte konfigurerad.'), { status: 503, code: 'not_configured' });
  return context;
}

export async function getPublicRestaurantInfo() {
  const sql = db();
  const context = await loadContext(sql);
  const hours = await sql`
    SELECT weekday, opens_at::text, closes_at::text, closed, note, source
      FROM opening_hours WHERE location_id = ${context.location_id}
     ORDER BY weekday`;
  return { ...context, openingHours: hours };
}

export async function getOpening(sql, context, date) {
  const [row] = await sql`
    SELECT oh.weekday, oh.opens_at::text, oh.closes_at::text, oh.closed,
           (((${date}::date + oh.opens_at) AT TIME ZONE ${context.timezone})) AS opens_ts,
           (((CASE WHEN oh.closes_at <= oh.opens_at THEN ${date}::date + 1 ELSE ${date}::date END + oh.closes_at) AT TIME ZONE ${context.timezone})) AS closes_ts
      FROM opening_hours oh
     WHERE oh.location_id = ${context.location_id}
       AND oh.weekday = EXTRACT(ISODOW FROM ${date}::date)::int
       AND (oh.valid_from IS NULL OR oh.valid_from <= ${date}::date)
       AND (oh.valid_until IS NULL OR oh.valid_until >= ${date}::date)
     ORDER BY oh.valid_from DESC NULLS LAST
     LIMIT 1`;
  return row || null;
}

export async function loadTables(sql, context) {
  const tables = await sql`
    SELECT id::text, code, label, min_capacity, max_capacity, active, x, y, width, height, shape, is_development_default
      FROM dining_tables WHERE location_id = ${context.location_id} AND active`;
  const comboRows = await sql`
    SELECT tc.id::text, tc.code, tc.label, tc.min_capacity, tc.max_capacity, tc.priority, tc.active,
           COALESCE(array_agg(tcm.table_id::text ORDER BY dt.code) FILTER (WHERE tcm.table_id IS NOT NULL), ARRAY[]::text[]) AS table_ids
      FROM table_combinations tc
      LEFT JOIN table_combination_members tcm ON tcm.combination_id = tc.id
      LEFT JOIN dining_tables dt ON dt.id = tcm.table_id
     WHERE tc.location_id = ${context.location_id} AND tc.active
     GROUP BY tc.id, tc.code, tc.label, tc.min_capacity, tc.max_capacity, tc.priority, tc.active`;
  return { tables, combinations: comboRows };
}

export async function localDateTime(sql, date, time, timezone, dayOffset = 0) {
  const [row] = await sql`
    SELECT (((${date}::date + ${dayOffset}::int) + ${time}::time) AT TIME ZONE ${timezone}) AS ts`;
  return row.ts;
}

export async function busyFor(sql, context, startsAt, endsAt) {
  const busy = await sql`
    SELECT DISTINCT rta.table_id::text AS table_id
      FROM reservation_table_assignments rta
      JOIN reservations r ON r.id = rta.reservation_id
     WHERE r.location_id = ${context.location_id}
       AND r.status IN ('pending','confirmed','arrived','seated')
       AND rta.active
       AND rta.during && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz, '[)')
    UNION
    SELECT bp.table_id::text
      FROM blocked_periods bp
     WHERE bp.location_id = ${context.location_id}
       AND bp.table_id IS NOT NULL
       AND tstzrange(bp.starts_at, bp.ends_at, '[)') && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz, '[)')`;
  return new Set(busy.map(r => r.table_id));
}

export async function locationBlocked(sql, context, startsAt, endsAt) {
  const [row] = await sql`
    SELECT EXISTS(
      SELECT 1 FROM blocked_periods bp
       WHERE bp.location_id = ${context.location_id} AND bp.table_id IS NULL
         AND tstzrange(bp.starts_at, bp.ends_at, '[)') && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz, '[)')
    ) AS blocked`;
  return Boolean(row?.blocked);
}

export async function capacityAllows(sql, context, date, startsAt, partySize) {
  const rules = await sql`
    SELECT * FROM capacity_rules
     WHERE location_id = ${context.location_id} AND active
       AND (weekday IS NULL OR weekday = EXTRACT(ISODOW FROM ${date}::date)::int)`;
  if (!rules.length) return true;
  for (const rule of rules) {
    if (rule.max_arriving_covers) {
      const [count] = await sql`
        SELECT COALESCE(sum(party_size),0)::int AS covers
          FROM reservations
         WHERE location_id = ${context.location_id}
           AND status IN ('pending','confirmed','arrived','seated')
           AND starts_at >= ${startsAt}::timestamptz - (${rule.window_minutes}::int * interval '1 minute') / 2
           AND starts_at <  ${startsAt}::timestamptz + (${rule.window_minutes}::int * interval '1 minute') / 2`;
      if (Number(count.covers) + partySize > Number(rule.max_arriving_covers)) return false;
    }
  }
  return true;
}
