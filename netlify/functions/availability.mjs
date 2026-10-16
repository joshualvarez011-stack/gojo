import { checkAvailability, findManagedReservation } from './_lib/booking-service.mjs';
import { validateDate, validateParty } from './_lib/validation.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    let date, partySize, code, token;
    if (req.method === 'POST') {
      const body = await readJson(req, 5000);
      date = validateDate(body.date);
      partySize = validateParty(body.partySize, 1, 30);
      code = body.code; token = body.token;
    } else {
      const url = new URL(req.url);
      date = validateDate(url.searchParams.get('date'));
      partySize = validateParty(url.searchParams.get('partySize'),1,30);
    }
    let excludeReservationId=null;
    if(code&&token){const managed=await findManagedReservation(String(code).toUpperCase(),String(token));if(managed)excludeReservationId=managed.id;}
    const result = await checkAvailability({ date, partySize, excludeReservationId });
    return json({
      ok:true, date, partySize, closed:Boolean(result.closed), largeParty:Boolean(result.largeParty), slots:result.slots || [],
      rules:{
        maxOnlinePartySize:result.context.max_online_party_size,
        largePartyThreshold:result.context.large_party_threshold,
        durationMinutes:result.context.default_duration_minutes,
        developmentDefaults:Boolean(result.context.is_development_default)
      }
    });
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/availability', method:['GET','POST'], rateLimit:{ windowLimit:40, windowSize:60, aggregateBy:['ip','domain'] } };
