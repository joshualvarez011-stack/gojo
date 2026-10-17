import { db } from './db.mjs';
import { generateLocalSlots, chooseBestTableSet, busyTablesForRange, overlap, minutesFromClock } from './booking-engine.mjs';
import { loadContext, getOpening, loadTables } from './booking-context.mjs';

export async function checkAvailability({ date, partySize, excludeReservationId = null }) {
  const sql = db();
  const context = await loadContext(sql);
  if (partySize < context.min_party_size || partySize > context.max_online_party_size) {
    return { context, slots: [], largeParty: partySize >= context.large_party_threshold };
  }

  const opening = await getOpening(sql, context, date);
  if (!opening || opening.closed || !opening.opens_at || !opening.closes_at) return { context, slots: [], closed: true };

  const { tables, combinations } = await loadTables(sql, context);
  const localSlots = generateLocalSlots({
    opensAt: opening.opens_at,
    closesAt: opening.closes_at,
    intervalMinutes: context.slot_interval_minutes,
    durationMinutes: context.default_duration_minutes
  });

  const openTs = new Date(opening.opens_ts);
  const closeTs = new Date(opening.closes_ts);
  const queryStart = new Date(openTs.getTime() - context.buffer_before_minutes * 60000);
  const queryEnd = new Date(closeTs.getTime() + context.buffer_after_minutes * 60000);

  const [assignments, blocks, capacityRules, dayReservations, nowRows] = await Promise.all([
    sql`
      SELECT rta.table_id::text AS table_id, lower(rta.during) AS starts_at, upper(rta.during) AS ends_at, rta.active
        FROM reservation_table_assignments rta
        JOIN reservations r ON r.id=rta.reservation_id
       WHERE r.location_id=${context.location_id}
         AND r.status IN ('pending','confirmed','arrived','seated')
         AND (${excludeReservationId}::uuid IS NULL OR r.id <> ${excludeReservationId}::uuid)
         AND rta.active
         AND rta.during && tstzrange(${queryStart}::timestamptz,${queryEnd}::timestamptz,'[)')`,
    sql`
      SELECT table_id::text,starts_at,ends_at FROM blocked_periods
       WHERE location_id=${context.location_id}
         AND tstzrange(starts_at,ends_at,'[)') && tstzrange(${queryStart}::timestamptz,${queryEnd}::timestamptz,'[)')`,
    sql`SELECT weekday,starts_at::text,ends_at::text,window_minutes,max_arriving_covers,max_active_covers
          FROM capacity_rules WHERE location_id=${context.location_id} AND active
           AND (weekday IS NULL OR weekday=EXTRACT(ISODOW FROM ${date}::date)::int)`,
    sql`SELECT party_size,starts_at,ends_at FROM reservations
          WHERE location_id=${context.location_id} AND status IN ('pending','confirmed','arrived','seated')
            AND (${excludeReservationId}::uuid IS NULL OR id <> ${excludeReservationId}::uuid)
            AND tstzrange(starts_at,ends_at,'[)') && tstzrange(${queryStart}::timestamptz,${queryEnd}::timestamptz,'[)')`,
    sql`SELECT now() AS now_ts`
  ]);

  const now = new Date(nowRows[0].now_ts);
  const minLead = new Date(now.getTime() + context.min_lead_minutes * 60000);
  const maxAdvance = new Date(now.getTime() + context.max_advance_days * 86400000);
  const openMinute = minutesFromClock(opening.opens_at);
  const slots = [];

  function ruleApplies(rule, localMinute) {
    if (!rule.starts_at || !rule.ends_at) return true;
    const a=minutesFromClock(rule.starts_at), b=minutesFromClock(rule.ends_at);
    return b>a ? localMinute>=a && localMinute<b : localMinute>=a || localMinute<b;
  }
  function capacityAllowed(startsAt,endsAt,localMinute) {
    for (const rule of capacityRules) {
      if (!ruleApplies(rule,localMinute)) continue;
      if (rule.max_arriving_covers) {
        const half=Number(rule.window_minutes)*60000/2;
        const covers=dayReservations.filter(r=>Math.abs(new Date(r.starts_at)-startsAt)<half).reduce((n,r)=>n+Number(r.party_size),0);
        if (covers+partySize>Number(rule.max_arriving_covers)) return false;
      }
      if (rule.max_active_covers) {
        const covers=dayReservations.filter(r=>overlap(startsAt,endsAt,r.starts_at,r.ends_at)).reduce((n,r)=>n+Number(r.party_size),0);
        if (covers+partySize>Number(rule.max_active_covers)) return false;
      }
    }
    return true;
  }

  for (const slot of localSlots) {
    const localMinute=minutesFromClock(slot.time)+slot.dayOffset*1440;
    const offsetMinutes=localMinute-openMinute;
    const start=new Date(openTs.getTime()+offsetMinutes*60000);
    const end=new Date(start.getTime()+context.default_duration_minutes*60000);
    if (start<minLead || start>maxAdvance) continue;
    const bufferedStart=new Date(start.getTime()-context.buffer_before_minutes*60000);
    const bufferedEnd=new Date(end.getTime()+context.buffer_after_minutes*60000);
    const locationBlocked=blocks.some(b=>!b.table_id && overlap(bufferedStart,bufferedEnd,b.starts_at,b.ends_at));
    if(locationBlocked || !capacityAllowed(start,end,localMinute%1440)) continue;
    const busy=busyTablesForRange(assignments,bufferedStart,bufferedEnd);
    for(const block of blocks){if(block.table_id && overlap(bufferedStart,bufferedEnd,block.starts_at,block.ends_at)) busy.add(block.table_id);}
    const assignment=chooseBestTableSet({tables,combinations,busyTableIds:busy,partySize});
    if(assignment) slots.push({time:slot.time,available:true});
  }
  return { context, opening, slots, closed:false };
}
