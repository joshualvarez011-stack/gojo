import { db } from './_lib/db.mjs';
import { loadContext, createReservation } from './_lib/booking-service.mjs';
import { requireAdmin, requireSameOrigin } from './_lib/auth.mjs';
import { validateReservationInput, cleanText } from './_lib/validation.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';

const STATUSES=new Set(['confirmed','arrived','seated','completed','cancelled','no_show']);

export default async(req)=>{
  try{
    requireAdmin(req); requireSameOrigin(req); const body=await readJson(req); const sql=db(); const context=await loadContext(sql);
    if(body.action==='create'){
      const guest=validateReservationInput({...body.reservation,privacyAccepted:true},context);
      const result=await createReservation(guest,'admin'); return json({ok:true,...result},201);
    }
    const id=cleanText(body.reservationId,80,true);
    if(body.action==='status'){
      const status=String(body.status||''); if(!STATUSES.has(status)) throw Object.assign(new Error('Ogiltig status.'),{status:400});
      return sql.begin(async tx=>{
        const [r]=await tx`SELECT * FROM reservations WHERE id=${id}::uuid AND restaurant_id=${context.restaurant_id} FOR UPDATE`;
        if(!r) throw Object.assign(new Error('Bokningen hittades inte.'),{status:404,code:'not_found'});
        const recordVisit=status==='completed' && !r.visit_count_recorded;
        const recordNoShow=status==='no_show' && !r.no_show_count_recorded;
        const [updated]=await tx`UPDATE reservations SET
          status=${status}::reservation_status, updated_at=now(),
          cancelled_at=CASE WHEN ${status}='cancelled' THEN COALESCE(cancelled_at,now()) ELSE cancelled_at END,
          visit_count_recorded=visit_count_recorded OR ${recordVisit},
          no_show_count_recorded=no_show_count_recorded OR ${recordNoShow}
          WHERE id=${r.id} RETURNING id::text,status,visit_count_recorded,no_show_count_recorded`;
        if(status==='cancelled') await tx`UPDATE reservation_table_assignments SET active=false WHERE reservation_id=${r.id}`;
        if(recordVisit && r.customer_id) await tx`UPDATE customers SET visit_count=visit_count+1,last_seen_at=now() WHERE id=${r.customer_id}`;
        if(recordNoShow && r.customer_id) await tx`UPDATE customers SET no_show_count=no_show_count+1,last_seen_at=now() WHERE id=${r.customer_id}`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','reservation.status_changed','reservation',${r.id},${JSON.stringify({from:r.status,to:status})}::jsonb)`;
        return json({ok:true,reservation:updated});
      });
    }
    if(body.action==='note'){
      const note=cleanText(body.internalNote,1200,false);
      const [updated]=await sql`UPDATE reservations SET internal_note=${note || null},updated_at=now() WHERE id=${id}::uuid AND restaurant_id=${context.restaurant_id} RETURNING id::text,internal_note`;
      if(!updated) throw Object.assign(new Error('Bokningen hittades inte.'),{status:404});
      return json({ok:true,reservation:updated});
    }
    throw Object.assign(new Error('Åtgärden stöds inte.'),{status:400,code:'unsupported_action'});
  }catch(error){return safeError(error);}
};
export const config={path:'/api/admin/action',method:'POST',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
