export function minutesFromClock(value) {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function clockFromMinutes(value) {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function generateLocalSlots({ opensAt, closesAt, intervalMinutes, durationMinutes }) {
  const open = minutesFromClock(opensAt);
  let close = minutesFromClock(closesAt);
  if (close <= open) close += 1440;
  const slots = [];
  for (let cursor = open; cursor + durationMinutes <= close; cursor += intervalMinutes) {
    slots.push({ time: clockFromMinutes(cursor), dayOffset: Math.floor(cursor / 1440) });
  }
  return slots;
}

function setFree(ids, busy) {
  return ids.every(id => !busy.has(id));
}

export function chooseBestTableSet({ tables, combinations, busyTableIds = [], partySize }) {
  const busy = busyTableIds instanceof Set ? busyTableIds : new Set(busyTableIds);
  const singles = tables
    .filter(t => t.active !== false && partySize >= Number(t.min_capacity || 1) && partySize <= Number(t.max_capacity) && !busy.has(t.id))
    .map(t => ({ type: 'table', code: t.code, tableIds: [t.id], maxCapacity: Number(t.max_capacity), priority: 0 }))
    .sort((a, b) => (a.maxCapacity - partySize) - (b.maxCapacity - partySize) || a.code.localeCompare(b.code));

  const combos = combinations
    .filter(c => c.active !== false && partySize >= Number(c.min_capacity) && partySize <= Number(c.max_capacity) && setFree(c.table_ids || [], busy))
    .map(c => ({ type: 'combination', code: c.code, tableIds: [...c.table_ids], maxCapacity: Number(c.max_capacity), priority: Number(c.priority || 100) }))
    .sort((a, b) => (a.maxCapacity - partySize) - (b.maxCapacity - partySize) || a.priority - b.priority || a.code.localeCompare(b.code));

  if (singles.length && combos.length) {
    const singleWaste = singles[0].maxCapacity - partySize;
    const comboWaste = combos[0].maxCapacity - partySize;
    return singleWaste <= comboWaste + 1 ? singles[0] : combos[0];
  }
  return singles[0] || combos[0] || null;
}

export function overlap(startA, endA, startB, endB) {
  return new Date(startA).getTime() < new Date(endB).getTime() && new Date(endA).getTime() > new Date(startB).getTime();
}

export function busyTablesForRange(assignments, startsAt, endsAt) {
  const result = new Set();
  for (const a of assignments) {
    if (a.active !== false && overlap(startsAt, endsAt, a.starts_at, a.ends_at)) result.add(a.table_id);
  }
  return result;
}
