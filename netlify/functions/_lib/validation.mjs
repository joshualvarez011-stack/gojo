const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message, code = 'validation_error') {
  throw Object.assign(new Error(message), { status: 400, code });
}

export function cleanText(value, max = 200, required = false) {
  const v = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !v) fail('Ett obligatoriskt fält saknas.');
  if (v.length > max) fail('Texten är för lång.');
  return v;
}

export function validateDate(value) {
  const v = String(value || '');
  if (!DATE_RE.test(v)) fail('Ogiltigt datum.');
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) fail('Ogiltigt datum.');
  return v;
}

export function validateTime(value) {
  const v = String(value || '');
  if (!TIME_RE.test(v)) fail('Ogiltig tid.');
  return v;
}

export function validateParty(value, min = 1, max = 30) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(`Antal gäster måste vara ${min}–${max}.`);
  return n;
}

export function normalizePhone(value) {
  let v = String(value ?? '').trim();
  v = v.replace(/[()\s.-]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  if (!/^\+?\d{7,16}$/.test(v)) fail('Kontrollera telefonnumret.');
  if (v.startsWith('0')) v = `+46${v.slice(1)}`;
  return v;
}

export function normalizeEmail(value, required = false) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v && !required) return null;
  if (!v || v.length > 254 || !EMAIL_RE.test(v)) fail('Kontrollera e-postadressen.');
  return v;
}

export function validateReservationInput(body, rules = {}) {
  return {
    name: cleanText(body.name, 100, true),
    phone: normalizePhone(body.phone),
    email: normalizeEmail(body.email, false),
    partySize: validateParty(body.partySize, rules.min_party_size || 1, rules.max_online_party_size || 8),
    date: validateDate(body.date),
    time: validateTime(body.time),
    note: cleanText(body.note, 700, false),
    privacyAccepted: body.privacyAccepted === true
  };
}
