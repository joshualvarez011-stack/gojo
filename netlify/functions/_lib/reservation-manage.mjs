import { db } from './db.mjs';
import { chooseBestTableSet } from './booking-engine.mjs';
import { loadContext, getOpening, loadTables, localDateTime, busyFor, locationBlocked, capacityAllows } from './booking-context.mjs';
import { hashToken, upsertCustomer } from './reservation-create.mjs';

export async function findManagedReservation(code, manageToken) {
  const sql = db();
  const [row] = await sql`
    SELECT r.id::text, r.confirmation_code, r.guest_name, r.guest_phone, r.guest_email, r.party_size,
           r.starts_at, r.ends_at, r.status, r.guest_note, l.name AS location_name,
           rest.name AS restaurant_name, rest.timezone
      FROM reservations r JOIN locations l ON l.id=r.location_id JOIN restaurants rest ON rest.id=r.restaurant_id
     WHERE r.confirmation_code=${code} AND r.manage_token_hash=${hashToken(manageToken)} LIMIT 1`;
  return row || null;
}

export async function cancelManagedReservation(code, manageToken) {
  const sql = db();
  return sql.begin(async tx => {
    const [reservation] = await tx`
      SELECT * FROM reservations WHERE confirmation_code=${code} AND manage_token_hash=${hashToken(manageToken)} FOR UPDATE`;
    if (!reservation) throw Object.assign(new Error('Bokningen hittades inte.'), { status: 404, code: 'not_found' });
    if (reservation.status === 'cancelled') return { reservation, changed: false };
    if (['completed','no_show'].includes(reservation.status)) throw Object.assign(new Error('Bokningen kan inte längre avbokas online.'), { status: 409, code: 'not_cancellable' });
    const [updated] = await tx`
      UPDATE reservations SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=${reservation.id} RETURNING *`;
    await tx`UPDATE reservation_table_assignments SET active=false WHERE reservation_id=${reservation.id}`;
    await tx`
      INSERT INTO notification_events (restaurant_id,reservation_id,event_type,channel,recipient)
      VALUES (${reservation.restaurant_id},${reservation.id},'booking_cancelled','mock',${reservation.guest_email || reservation.guest_phone})`;
    await tx`
      INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id)
      VALUES (${reservation.restaurant_id},'guest','reservation.cancelled','reservation',${reservation.id})`;
    return { reservation: updated, changed: true };
  });
}

export async function modifyManagedReservation(code, manageToken, change) {
  const sql = db();
  const context = await loadContext(sql);
  return sql.begin(async tx => {
    const [reservation] = await tx`
      SELECT * FROM reservations
       WHERE confirmation_code=${code} AND manage_token_hash=${hashToken(manageToken)}
       FOR UPDATE`;
    if (!reservation) throw Object.assign(new Error('Bokningen hittades inte.'), { status:404, code:'not_found' });
    if (!['pending','confirmed'].includes(reservation.status)) throw Object.assign(new Error('Bokningen kan inte ändras online i nuvarande status.'), { status:409, code:'not_modifiable' });

    const oldLocal = await tx`
      SELECT (starts_at AT TIME ZONE ${context.timezone})::date::text AS date
      FROM reservations WHERE id=${reservation.id}`;
    const lockDates=[oldLocal[0].date,change.date].sort();
    for(const d of [...new Set(lockDates)]) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.location_id}:${d}`}::text,0))`;

    const opening=await getOpening(tx,context,change.date);
    if(!opening||opening.closed) throw Object.assign(new Error('Restaurangen är stängd den dagen.'),{status:409,code:'closed'});
    if(change.partySize<context.min_party_size||change.partySize>context.max_online_party_size) throw Object.assign(new Error('Sällskapets storlek kan inte bokas online.'),{status:409,code:'party_size'});
    const startsAt=await localDateTime(tx,change.date,change.time,context.timezone,0);
    const start=new Date(startsAt); const endsAt=new Date(start.getTime()+context.default_duration_minutes*60000);
    const [nowRow]=await tx`SELECT now() AS now_ts`; const now=new Date(nowRow.now_ts);
    if(start.getTime()<now.getTime()+context.min_lead_minutes*60000) throw Object.assign(new Error('Tiden ligger för nära inpå.'),{status:409,code:'lead_time'});
    if(start.getTime()>now.getTime()+context.max_advance_days*86400000) throw Object.assign(new Error('Datumet ligger för långt fram.'),{status:409,code:'advance_limit'});
    if(start<new Date(opening.opens_ts)||endsAt>new Date(opening.closes_ts)) throw Object.assign(new Error('Tiden ligger utanför bokningsbara öppettider.'),{status:409,code:'outside_hours'});

    const bufferedStart=new Date(start.getTime()-context.buffer_before_minutes*60000);
    const bufferedEnd=new Date(endsAt.getTime()+context.buffer_after_minutes*60000);
    if(await locationBlocked(tx,context,bufferedStart,bufferedEnd)) throw Object.assign(new Error('Tiden är blockerad.'),{status:409,code:'blocked'});
    if(!(await capacityAllows(tx,context,change.date,startsAt,endsAt,change.partySize,reservation.id))) throw Object.assign(new Error('Kapaciteten är full för tiden.'),{status:409,code:'capacity_full'});

    await tx`DELETE FROM reservation_table_assignments WHERE reservation_id=${reservation.id}`;
    const {tables,combinations}=await loadTables(tx,context);
    const busy=await busyFor(tx,context,bufferedStart,bufferedEnd);
    const assignment=chooseBestTableSet({tables,combinations,busyTableIds:busy,partySize:change.partySize});
    if(!assignment) throw Object.assign(new Error('Tiden blev precis fullbokad. Välj en annan tid.'),{status:409,code:'slot_taken'});
    for(const tableId of assignment.tableIds){
      await tx`INSERT INTO reservation_table_assignments (reservation_id,table_id,during,active)
               VALUES (${reservation.id},${tableId},tstzrange(${bufferedStart},${bufferedEnd},'[)'),true)`;
    }
    const [updated]=await tx`
      UPDATE reservations SET party_size=${change.partySize},starts_at=${startsAt},ends_at=${endsAt},updated_at=now()
       WHERE id=${reservation.id} RETURNING *`;
    await tx`INSERT INTO notification_events (restaurant_id,reservation_id,event_type,channel,recipient)
             VALUES (${reservation.restaurant_id},${reservation.id},'booking_modified','mock',${reservation.guest_email||reservation.guest_phone})`;
    await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata)
             VALUES (${reservation.restaurant_id},'guest','reservation.modified','reservation',${reservation.id},${JSON.stringify({date:change.date,time:change.time,partySize:change.partySize})}::jsonb)`;
    return {reservation:updated,assignment:{type:assignment.type,code:assignment.code}};
  });
}

export async function joinWaitlist(guest) {
  const sql = db();
  const context = await loadContext(sql);
  if (guest.partySize < context.min_party_size || guest.partySize > context.max_online_party_size) {
    throw Object.assign(new Error('Sällskapets storlek kan inte läggas på väntelistan online.'), { status:409, code:'party_size' });
  }

  return sql.begin(async tx => {
    const opening = await getOpening(tx, context, guest.date);
    if (!opening || opening.closed || !opening.opens_at || !opening.closes_at) {
      throw Object.assign(new Error('Restaurangen är stängd den dagen.'), { status:409, code:'closed' });
    }
    if (guest.latestTime < guest.earliestTime) {
      throw Object.assign(new Error('Senaste önskade tid måste vara efter den tidigaste.'), { status:400, code:'waitlist_window' });
    }

    const earliestAt = new Date(await localDateTime(tx, guest.date, guest.earliestTime, context.timezone, 0));
    const latestAt = new Date(await localDateTime(tx, guest.date, guest.latestTime, context.timezone, 0));
    const latestSittingEnds = new Date(latestAt.getTime() + context.default_duration_minutes * 60000);
    const opensAt = new Date(opening.opens_ts);
    const closesAt = new Date(opening.closes_ts);
    const [nowRow] = await tx`SELECT now() AS now_ts`;
    const now = new Date(nowRow.now_ts);

    if (earliestAt < opensAt || latestSittingEnds > closesAt) {
      throw Object.assign(new Error('Väntelistans tidsintervall ligger utanför bokningsbara öppettider.'), { status:409, code:'outside_hours' });
    }
    if (latestAt <= now) {
      throw Object.assign(new Error('Väntelistans tidsintervall har redan passerat.'), { status:409, code:'past_window' });
    }
    if (earliestAt.getTime() > now.getTime() + context.max_advance_days * 86400000) {
      throw Object.assign(new Error('Datumet ligger för långt fram.'), { status:409, code:'advance_limit' });
    }

    const customer = await upsertCustomer(tx, context, guest);
    const [entry] = await tx`
      INSERT INTO waitlist_entries (location_id,customer_id,guest_name,guest_phone,guest_email,party_size,requested_date,earliest_time,latest_time,note)
      VALUES (${context.location_id},${customer.id},${guest.name},${guest.phone},${guest.email},${guest.partySize},${guest.date},${guest.earliestTime},${guest.latestTime},${guest.note || null})
      RETURNING id::text,status,created_at`;
    await tx`
      INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id)
      VALUES (${context.restaurant_id},'guest','waitlist.joined','waitlist',${entry.id})`;
    return entry;
  });
}
