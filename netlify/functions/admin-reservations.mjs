import { db } from './_lib/db.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { getOpening, localDateTime } from './_lib/booking-context.mjs';
import { requireAdmin } from './_lib/auth.mjs';
import { validateDate } from './_lib/validation.mjs';
import { json, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    requireAdmin(req);
    const sql=db(); const context=await loadContext(sql); const url=new URL(req.url);
    const date=validateDate(url.searchParams.get('date'));
    const dayStart=await localDateTime(sql,date,'00:00',context.timezone,0);
    const dayEnd=await localDateTime(sql,date,'00:00',context.timezone,1);
    const [reservations,waitlist,tables,blocks,opening]=await Promise.all([
      sql`
        SELECT r.id::text,r.confirmation_code,r.guest_name,r.guest_phone,r.guest_email,r.party_size,r.starts_at,r.ends_at,r.status,r.source,r.guest_note,r.internal_note,
               COALESCE(string_agg(dt.code, ', ' ORDER BY dt.code),'–') AS table_codes
          FROM reservations r
          LEFT JOIN reservation_table_assignments rta ON rta.reservation_id=r.id AND rta.active
          LEFT JOIN dining_tables dt ON dt.id=rta.table_id
         WHERE r.location_id=${context.location_id}
           AND (r.starts_at AT TIME ZONE ${context.timezone})::date=${date}::date
         GROUP BY r.id ORDER BY r.starts_at`,
      sql`
        SELECT id::text,guest_name,guest_phone,party_size,requested_date,earliest_time::text,latest_time::text,status,note,created_at
          FROM waitlist_entries WHERE location_id=${context.location_id} AND requested_date=${date}::date ORDER BY created_at`,
      sql`
        SELECT id::text,code,label,min_capacity,max_capacity,x,y,width,height,shape,active,is_development_default
          FROM dining_tables WHERE location_id=${context.location_id} ORDER BY code`,
      sql`
        SELECT bp.id::text,bp.table_id::text,bp.starts_at,bp.ends_at,bp.reason,dt.code AS table_code,dt.label AS table_label
          FROM blocked_periods bp
          LEFT JOIN dining_tables dt ON dt.id=bp.table_id
         WHERE bp.location_id=${context.location_id}
           AND bp.starts_at < ${dayEnd}::timestamptz
           AND bp.ends_at > ${dayStart}::timestamptz
         ORDER BY bp.starts_at`,
      getOpening(sql,context,date)
    ]);
    const active=reservations.filter(r=>['confirmed','arrived','seated'].includes(r.status));
    const stats={ reservations:active.length, covers:active.reduce((n,r)=>n+Number(r.party_size),0), waitlist:waitlist.filter(w=>w.status==='waiting').length,
      largeParties:active.filter(r=>Number(r.party_size)>=context.large_party_threshold).length };
    return json({ok:true,date,stats,reservations,waitlist,tables,blocks,opening,developmentDefaults:Boolean(context.is_development_default)});
  } catch(error){ return safeError(error); }
};
export const config={path:'/api/admin/reservations',method:'GET',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
