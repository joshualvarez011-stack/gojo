import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../netlify/functions/_lib/db.mjs';
import availabilityHandler from '../netlify/functions/availability.mjs';
import reservationHandler from '../netlify/functions/reservations.mjs';
import manageHandler from '../netlify/functions/manage-reservation.mjs';

const enabled = process.env.NODE_ENV === 'test' && Boolean(process.env.TEST_DATABASE_URL);
const base = 'http://gojo-ci.example.test';

function nextWeekday(dayOfWeek) {
  const day = new Date(Date.now() + 21 * 86400000);
  day.setUTCHours(12, 0, 0, 0);
  while (day.getUTCDay() !== dayOfWeek) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
async function post(handler, path, body) {
  const response = await handler(new Request(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() };
}
async function available(date, partySize) {
  const response = await availabilityHandler(new Request(base + '/api/availability?date=' + date + '&partySize=' + partySize));
  return { status: response.status, body: await response.json() };
}
after(async () => {
  if (enabled) await db().end({ timeout: 2 });
});

test('guest API: availability, concurrent booking, cancellation and rescheduling', { skip: !enabled }, async () => {
  const monday = nextWeekday(1), wednesday = nextWeekday(3);
  const closed = await available(monday, 2);
  assert.equal(closed.status, 200);
  assert.equal(closed.body.closed, true);
  assert.deepEqual(closed.body.slots, []);

  const illegal = await post(reservationHandler, '/api/reservations', {
    name: 'Test Closed', phone: '+46709991111', partySize: 2,
    date: monday, time: '18:00', privacyAccepted: true
  });
  assert.equal(illegal.status, 409);
  assert.equal(illegal.body.error, 'closed');

  const open = await available(wednesday, 8);
  assert.equal(open.status, 200);
  assert.equal(open.body.closed, false);
  assert.ok(open.body.slots.some(slot => slot.time === '18:00'));

  const eight = phone => ({
    name: 'CI Test Eight', phone, email: 'ci@example.test',
    partySize: 8, date: wednesday, time: '18:00', privacyAccepted: true
  });
  const attempts = await Promise.all([
    post(reservationHandler, '/api/reservations', eight('+46709991112')),
    post(reservationHandler, '/api/reservations', eight('+46709991113'))
  ]);
  assert.deepEqual(attempts.map(attempt => attempt.status).sort(), [201, 409]);
  const winner = attempts.find(attempt => attempt.status === 201).body;
  const loser = attempts.find(attempt => attempt.status === 409).body;
  assert.equal(loser.error, 'slot_taken');
  assert.ok(winner.manageToken);
  const taken = await available(wednesday, 8);
  assert.ok(!taken.body.slots.some(slot => slot.time === '18:00'));

  const key = { code: winner.reservation.confirmationCode, token: winner.manageToken };
  const lookup = await post(manageHandler, '/api/reservation/manage', { action: 'lookup', ...key });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.reservation.party_size, 8);
  const denied = await post(manageHandler, '/api/reservation/manage', {
    action: 'lookup', code: key.code, token: 'not-the-key'
  });
  assert.equal(denied.status, 404);

  const cancelled = await post(manageHandler, '/api/reservation/manage', { action: 'cancel', ...key });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.changed, true);
  const repeated = await post(manageHandler, '/api/reservation/manage', { action: 'cancel', ...key });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.changed, false);
  const freed = await available(wednesday, 8);
  assert.ok(freed.body.slots.some(slot => slot.time === '18:00'));

  const small = await post(reservationHandler, '/api/reservations', {
    name: 'CI Test Two', phone: '+46709991114', email: 'ci@example.test',
    partySize: 2, date: wednesday, time: '17:00', privacyAccepted: true
  });
  assert.equal(small.status, 201);
  const smallKey = { code: small.body.reservation.confirmationCode, token: small.body.manageToken };
  const moved = await post(manageHandler, '/api/reservation/manage', {
    action: 'reschedule', ...smallKey, date: wednesday, time: '20:00', partySize: 2
  });
  assert.equal(moved.status, 200);
  const afterMove = await post(manageHandler, '/api/reservation/manage', { action: 'lookup', ...smallKey });
  assert.equal(afterMove.status, 200);
  const localTime = new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Stockholm'
  }).format(new Date(afterMove.body.reservation.starts_at));
  assert.equal(localTime, '20:00');
});