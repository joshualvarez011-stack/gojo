import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.mjs';
import { chooseBestTableSet } from './booking-engine.mjs';
import { loadContext, getOpening, loadTables, localDateTime, busyFor, locationBlocked, capacityAllows } from './booking-context.mjs';

function token(bytes = 24) { return randomBytes(bytes).toString('base64url'); }
function confirmationCode() { return `GJ-${randomBytes(4).toString('hex').toUpperCase()}`; }
export function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }

export async function upsertCustomer(tx, context, guest) {
  let customer;
  if (guest.phone) {
    [customer] = await tx`
      SELECT * FROM customers WHERE restaurant_id = ${context.restaurant_id} AND phone = ${guest.phone}
      ORDER BY last_seen_at DESC LIMIT 1`;
  }
  if (!customer && guest.email) {
    [customer] = await tx`
      SELECT * FROM customers WHERE restaurant_id = ${context.restaurant_id} AND lower(email) = lower(${guest.email})
      ORDER BY last_seen_at DESC LIMIT 1`;
  }
  if (customer) {
    [customer] = await tx`
      UPDATE customers SET name=${guest.name}, phone=COALESCE(${guest.phone},phone), email=COALESCE(${guest.email},email), last_seen_at=now()
       WHERE id=${customer.id} RETURNING *`;
    return customer;
  }
  [customer] = await tx`
    INSERT INTO customers (restaurant_id,name,phone,email) VALUES (${context.restaurant_id},${guest.name},${guest.phone},${guest.email}) RETURNING *`;
  return customer;
}

export async function createReservation(guest, source = 'web') {
  const sql = db();
  const context = await loadContext(sql);
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.location_id}:${guest.date}`}::text, 0))`;

    const opening = await getOpening(tx, context, guest.date);
    if (!opening || opening.closed) throw Object.assign(new Error('Restaurangen är stängd den dagen.'), { status: 409, code: 'closed' });
    if (guest.partySize > context.max_online_party_size) throw Object.assign(new Error('Kontakta restaurangen för större sällskap.'), { status: 409, code: 'large_party' });

    const startsAt = await localDateTime(tx, guest.date, guest.time, context.timezone, 0);
    const start = new Date(startsAt);
    const [nowRow] = await tx`SELECT now() AS now_ts`;
    const now = new Date(nowRow.now_ts);
    if (start.getTime() < now.getTime() + context.min_lead_minutes * 60000) throw Object.assign(new Error('Tiden ligger för nära inpå.'), { status: 409, code: 'lead_time' });
    if (start.getTime() > now.getTime() + context.max_advance_days * 86400000) throw Object.assign(new Error('Datumet ligger för långt fram.'), { status: 409, code: 'advance_limit' });

    const openTs = new Date(opening.opens_ts);
    const closeTs = new Date(opening.closes_ts);
    const endsAt = new Date(start.getTime() + context.default_duration_minutes * 60000);
    if (start < openTs || endsAt > closeTs) throw Object.assign(new Error('Tiden ligger utanför bokningsbara öppettider.'), { status: 409, code: 'outside_hours' });

    const { tables, combinations } = await loadTables(tx, context);
    const bufferedStart = new Date(start.getTime() - context.buffer_before_minutes * 60000);
    const bufferedEnd = new Date(endsAt.getTime() + context.buffer_after_minutes * 60000);
    if (await locationBlocked(tx, context, bufferedStart, bufferedEnd)) throw Object.assign(new Error('Tiden är blockerad.'), { status: 409, code: 'blocked' });
    if (!(await capacityAllows(tx, context, guest.date, startsAt, guest.partySize))) throw Object.assign(new Error('Kapaciteten är full för den tiden.'), { status: 409, code: 'capacity_full' });
    const busy = await busyFor(tx, context, bufferedStart, bufferedEnd);
    const assignment = chooseBestTableSet({ tables, combinations, busyTableIds: busy, partySize: guest.partySize });
    if (!assignment) throw Object.assign(new Error('Tiden blev precis fullbokad. Välj en annan tid.'), { status: 409, code: 'slot_taken' });

    const customer = await upsertCustomer(tx, context, guest);
    const manageToken = token();
    const code = confirmationCode();
    let reservation;
    try {
      [reservation] = await tx`
        INSERT INTO reservations (
          restaurant_id,location_id,customer_id,confirmation_code,manage_token_hash,guest_name,guest_phone,guest_email,
          party_size,starts_at,ends_at,status,source,guest_note,payment_mode
        ) VALUES (
          ${context.restaurant_id},${context.location_id},${customer.id},${code},${hashToken(manageToken)},${guest.name},${guest.phone},${guest.email},
          ${guest.partySize},${startsAt},${endsAt},'confirmed',${source},${guest.note || null},${context.payment_mode}
        ) RETURNING *`;
      for (const tableId of assignment.tableIds) {
        await tx`
          INSERT INTO reservation_table_assignments (reservation_id,table_id,during,active)
          VALUES (${reservation.id},${tableId},tstzrange(${bufferedStart},${bufferedEnd},'[)'),true)`;
      }
    } catch (error) {
      if (String(error?.constraint_name || error?.constraint || '').includes('no_overlapping_active_table_assignments') || error?.code === '23P01') {
        throw Object.assign(new Error('Tiden blev precis fullbokad. Välj en annan tid.'), { status: 409, code: 'slot_taken' });
      }
      throw error;
    }

    await tx`UPDATE customers SET visit_count = visit_count + 1, last_seen_at=now() WHERE id=${customer.id}`;
    await tx`
      INSERT INTO notification_events (restaurant_id,reservation_id,event_type,channel,recipient,payload)
      VALUES (${context.restaurant_id},${reservation.id},'booking_created','mock',${guest.email || guest.phone},${JSON.stringify({ confirmationCode: code })}::jsonb)`;
    await tx`
      INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata)
      VALUES (${context.restaurant_id},'guest','reservation.created','reservation',${reservation.id},${JSON.stringify({ source, partySize: guest.partySize })}::jsonb)`;

    return {
      reservation: {
        id: reservation.id,
        confirmationCode: code,
        name: reservation.guest_name,
        partySize: reservation.party_size,
        startsAt: reservation.starts_at,
        endsAt: reservation.ends_at,
        status: reservation.status
      },
      manageToken,
      assignment: { type: assignment.type, code: assignment.code },
      developmentDefaults: Boolean(context.is_development_default)
    };
  });
}
