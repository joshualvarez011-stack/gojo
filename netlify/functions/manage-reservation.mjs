import { findManagedReservation, cancelManagedReservation, modifyManagedReservation, loadContext } from './_lib/booking-service.mjs';
import { cleanText, validateDate, validateTime, validateParty } from './_lib/validation.mjs';
import { db } from './_lib/db.mjs';
import { sendReservationEmail } from './_lib/notifications.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    const body = await readJson(req);
    const code = cleanText(body.code,30,true).toUpperCase();
    const token = cleanText(body.token,200,true);
    if (body.action === 'lookup') {
      const reservation = await findManagedReservation(code,token);
      if (!reservation) return json({ ok:false,error:'not_found',message:'Bokningen hittades inte.' },404);
      return json({ ok:true,reservation });
    }
    if (body.action === 'cancel') {
      const result = await cancelManagedReservation(code,token);
      if (result.changed) {
        await sendReservationEmail({reservationId:result.reservation.id,eventType:'booking_cancelled',manageToken:token,baseUrl:new URL(req.url).origin});
      }
      return json({ ok:true,reservation:{ confirmationCode:result.reservation.confirmation_code,status:result.reservation.status },changed:result.changed });
    }
    if (body.action === 'reschedule') {
      const context=await loadContext(db());
      const change={date:validateDate(body.date),time:validateTime(body.time),partySize:validateParty(body.partySize,context.min_party_size,context.max_online_party_size)};
      const result=await modifyManagedReservation(code,token,change);
      await sendReservationEmail({reservationId:result.reservation.id,eventType:'booking_modified',manageToken:token,baseUrl:new URL(req.url).origin});
      return json({ok:true,reservation:{confirmationCode:result.reservation.confirmation_code,status:result.reservation.status,startsAt:result.reservation.starts_at,partySize:result.reservation.party_size}});
    }
    return json({ ok:false,error:'unsupported_action' },400);
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/reservation/manage', method:'POST', rateLimit:{ windowLimit:20, windowSize:60, aggregateBy:['ip','domain'] } };
