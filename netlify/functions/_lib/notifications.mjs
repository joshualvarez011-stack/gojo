import { db } from './db.mjs';

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export async function sendReservationEmail({reservationId,eventType,manageToken,baseUrl}){
  const apiKey=process.env.RESEND_API_KEY,from=process.env.GOJO_EMAIL_FROM;
  const sql=db();
  const [row]=await sql`
    SELECT r.id::text,r.confirmation_code,r.guest_name,r.guest_email,r.party_size,r.starts_at,r.status,
           rest.name AS restaurant_name,rest.timezone,rest.email AS restaurant_email,
           n.id::text AS notification_id
      FROM reservations r
      JOIN restaurants rest ON rest.id=r.restaurant_id
      LEFT JOIN LATERAL (
        SELECT id FROM notification_events WHERE reservation_id=r.id AND event_type=${eventType}
        ORDER BY created_at DESC LIMIT 1
      ) n ON true
     WHERE r.id=${reservationId}::uuid LIMIT 1`;
  if(!row||!row.guest_email)return {sent:false,reason:'no_email'};
  if(!apiKey||!from){
    if(row.notification_id)await sql`UPDATE notification_events SET status='suppressed',last_error='Email provider not configured' WHERE id=${row.notification_id}::uuid`;
    return {sent:false,reason:'not_configured'};
  }
  const when=new Intl.DateTimeFormat('sv-SE',{timeZone:row.timezone,dateStyle:'full',timeStyle:'short'}).format(new Date(row.starts_at));
  const manageUrl=manageToken?`${baseUrl}/hantera-bokning.html?code=${encodeURIComponent(row.confirmation_code)}&token=${encodeURIComponent(manageToken)}`:null;
  const subjects={booking_created:`Bokningsbekräftelse · ${row.restaurant_name}`,booking_modified:`Din bokning är ändrad · ${row.restaurant_name}`,booking_cancelled:`Din bokning är avbokad · ${row.restaurant_name}`};
  const statusCopy=eventType==='booking_cancelled'?'Bokningen är avbokad.':eventType==='booking_modified'?'Din bokning har uppdaterats.':'Din bokning är bekräftad.';
  const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17110d"><h1 style="font-family:Georgia,serif;font-weight:500;font-size:38px">${esc(row.restaurant_name)}</h1><p>${esc(statusCopy)}</p><div style="background:#f5ecdf;border-radius:14px;padding:18px;margin:22px 0"><strong>${esc(when)}</strong><br>${Number(row.party_size)} gäster<br>Bekräftelsekod: ${esc(row.confirmation_code)}</div>${manageUrl&&eventType!=='booking_cancelled'?`<p><a href="${esc(manageUrl)}" style="display:inline-block;background:#b95f30;color:white;text-decoration:none;padding:12px 18px;border-radius:999px">Hantera bokning</a></p>`:''}<p style="font-size:12px;color:#73685e">Frågor? Kontakta ${esc(row.restaurant_email||'restaurangen')}.</p></div>`;
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from,to:[row.guest_email],subject:subjects[eventType]||`GOJO · ${row.confirmation_code}`,html})});
    if(!response.ok)throw new Error(`Resend ${response.status}: ${await response.text()}`);
    if(row.notification_id)await sql`UPDATE notification_events SET channel='email',status='sent',attempts=attempts+1,sent_at=now(),last_error=NULL WHERE id=${row.notification_id}::uuid`;
    return {sent:true};
  }catch(error){
    console.error('Email failed',error);
    if(row.notification_id)await sql`UPDATE notification_events SET channel='email',status='failed',attempts=attempts+1,last_error=${String(error).slice(0,500)} WHERE id=${row.notification_id}::uuid`;
    return {sent:false,reason:'provider_error'};
  }
}
