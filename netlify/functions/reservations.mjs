import { loadContext, createReservation } from './_lib/booking-service.mjs';
import { validateReservationInput } from './_lib/validation.mjs';
import { db } from './_lib/db.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';
import { sendReservationEmail } from './_lib/notifications.mjs';

export default async (req) => {
  try {
    const body = await readJson(req);
    const context = await loadContext(db());
    const guest = validateReservationInput(body, context);
    if (!guest.privacyAccepted) throw Object.assign(new Error('Godkänn integritetsinformationen för att boka.'), { status:400, code:'privacy_required' });
    const result = await createReservation(guest,'web');
    const email = await sendReservationEmail({reservationId:result.reservation.id,eventType:'booking_created',manageToken:result.manageToken});
    return json({ ok:true, ...result, email },201);
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/reservations', method:'POST', rateLimit:{ windowLimit:8, windowSize:60, aggregateBy:['ip','domain'] } };
