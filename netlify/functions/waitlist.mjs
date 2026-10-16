import { loadContext, joinWaitlist } from './_lib/booking-service.mjs';
import { db } from './_lib/db.mjs';
import { cleanText, normalizePhone, normalizeEmail, validateDate, validateTime, validateParty } from './_lib/validation.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    const body = await readJson(req);
    const context = await loadContext(db());
    if (body.privacyAccepted !== true) throw Object.assign(new Error('Godkänn integritetsinformationen.'),{status:400,code:'privacy_required'});
    const guest = {
      name:cleanText(body.name,100,true), phone:normalizePhone(body.phone), email:normalizeEmail(body.email,false),
      partySize:validateParty(body.partySize,context.min_party_size,context.max_online_party_size), date:validateDate(body.date),
      earliestTime:validateTime(body.earliestTime), latestTime:validateTime(body.latestTime), note:cleanText(body.note,500,false)
    };
    const entry = await joinWaitlist(guest);
    return json({ok:true,entry},201);
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/waitlist', method:'POST', rateLimit:{ windowLimit:6, windowSize:60, aggregateBy:['ip','domain'] } };
