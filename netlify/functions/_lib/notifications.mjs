import { db } from './db.mjs';
import { emailPermission, emailBaseUrl, buildBookingEmail } from './email-content.mjs';

// Email delivery is best effort: the reservation must survive provider outages.
export async function sendReservationEmail({ reservationId, eventType, manageToken }) {
  try {
    const sql = db();
    const [row] = await sql`
      SELECT r.id::text,r.confirmation_code,r.guest_email,r.party_size,r.starts_at,
             rest.name AS restaurant_name,rest.timezone,rest.email AS restaurant_email,
             n.id::text AS notification_id,n.status AS notification_status
        FROM reservations r
        JOIN restaurants rest ON rest.id=r.restaurant_id
        LEFT JOIN LATERAL (
          SELECT id,status FROM notification_events
           WHERE reservation_id=r.id AND event_type=${eventType}
           ORDER BY created_at DESC LIMIT 1
        ) n ON true
       WHERE r.id=${reservationId}::uuid LIMIT 1`;

    if (!row || !row.notification_id) return { accepted:false, reason:'event_missing' };
    if (row.notification_status === 'sent') return { accepted:true, reason:'already_accepted' };

    const update = async (status, error = null, channel = 'mock', accepted = false) => {
      await sql`
        UPDATE notification_events SET status=${status},last_error=${error},
            channel=${channel},attempts=attempts+${accepted?1:0},
            sent_at=CASE WHEN ${accepted} THEN now() ELSE sent_at END
         WHERE id=${row.notification_id}::uuid`;
    };

    const gate = emailPermission(process.env, row.guest_email);
    if (!gate.allowed) {
      await update('suppressed', gate.reason);
      return { accepted:false, reason:gate.reason };
    }

    const baseUrl = emailBaseUrl(process.env);
    if (!baseUrl) {
      await update('suppressed', 'missing_trusted_public_url');
      return { accepted:false, reason:'missing_public_url' };
    }

    const message = buildBookingEmail(row,eventType,manageToken,baseUrl);
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{
        authorization:`Bearer ${process.env.RESEND_API_KEY}`,
        'content-type':'application/json',
        'Idempotency-Key':row.notification_id
      },
      body:JSON.stringify({
        from:process.env.GOJO_EMAIL_FROM,
        to:[row.guest_email],
        reply_to:row.restaurant_email || undefined,
        subject:message.subject,html:message.html,text:message.text
      }),
      signal:AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      await update('failed',`Resend HTTP ${response.status}`,'email');
      return { accepted:false, reason:'provider_error' };
    }
    await update('sent',null,'email',true);
    return { accepted:true }; // Accepted by provider; not proof of inbox delivery.
  } catch (error) {
    // Never log guest data, API credentials or private booking URLs.
    console.warn('Booking email notification failed:',error?.name || 'unknown_error');
    return { accepted:false, reason:'notification_error' };
  }
}
