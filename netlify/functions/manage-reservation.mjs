import { findManagedReservation, cancelManagedReservation, modifyManagedReservation, loadContext } from './_lib/booking-service.mjs';
import { cleanText, validateDate, validateTime, validateParty } from './_lib/validation.mjs';
import { db } from './_lib/db.mjs';
import { sendReservationEmail } from './_lib/notifications.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const code = cleanText(url.searchParams.get('code'),30,true).toUpperCase();
      const token = cleanText(url.searchParams.get('token'),200,true);
      const reservation = await findManagedReservation(code,token);
      if (!reservation) return json({ ok:false,error:'not_found',message:'Bokningen hittades inte.' },404);
      return json({ ok:true,reservation });
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const code = cleanText(body.code,30,true).toUpperCase();
      const token = cleanText(body.token,200,true);
      if (body.action === 'cancel') {
        const result = await cancelManagedReservation(code,token);
        await sendReservationEmail({reservationId:result.reservation.id,eventType:'booking_cancelled',manageToken:token,baseUrl:new URL(req.url).origin});
        return json({ ok:true,reservation:{ confirmationCode:result.reservation.confirmation_code,status:result.reservation.status } });
      }
      if (body.action === 'reschedule') {
        const context=await loadContext(db());
        const change={date:validateDate(body.date),time:validateTime(body.time),partySize:validateParty(body.partySize,context.min_party_size,context.max_online_party_size)};
        const result=await modifyManagedReservation(code,token,change);
        await sendReservationEmail({reservationId:result.reservation.id,eventType:'booking_modified',manageToken:token,baseUrl:new URL(req.url).origin});
        return json({ok:true,reservation:{confirmationCode:result.reservation.confirmation_code,status:result.reservation.status,startsAt:result.reservation.starts_at,partySize:result.reservation.party_size}});
      }
      return json({ ok:false,error:'unsupported_action' },400);
    }
    return json({ok:false,error:'method_not_allowed'},405);
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/reservation/manage', rateLimit:{ windowLimit:20, windowSize:60, aggregateBy:['ip','domain'] } };
