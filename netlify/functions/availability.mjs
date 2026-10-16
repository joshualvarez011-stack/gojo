import { checkAvailability, findManagedReservation } from './_lib/booking-service.mjs';
import { validateDate, validateParty } from './_lib/validation.mjs';
import { json, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const date = validateDate(url.searchParams.get('date'));
    const partySize = validateParty(url.searchParams.get('partySize'),1,30);
    let excludeReservationId=null;
    const code=url.searchParams.get('code'),token=url.searchParams.get('token');
    if(code&&token){const managed=await findManagedReservation(String(code).toUpperCase(),String(token));if(managed)excludeReservationId=managed.id;}
    const result = await checkAvailability({ date, partySize, excludeReservationId });
    return json({
      ok:true,
      date,
      partySize,
      closed:Boolean(result.closed),
      largeParty:Boolean(result.largeParty),
      slots:result.slots || [],
      rules:{
        maxOnlinePartySize:result.context.max_online_party_size,
        largePartyThreshold:result.context.large_party_threshold,
        durationMinutes:result.context.default_duration_minutes,
        developmentDefaults:Boolean(result.context.is_development_default)
      }
    });
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/availability', method:'GET', rateLimit:{ windowLimit:40, windowSize:60, aggregateBy:['ip','domain'] } };
