import { db } from './_lib/db.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { requireAdmin, requireSameOrigin } from './_lib/auth.mjs';
import { cleanText } from './_lib/validation.mjs';
import { readJson, json, safeError } from './_lib/http.mjs';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function customerId(v){const id=cleanText(v,80,true);if(!UUID_RE.test(id))throw Object.assign(new Error('Ogiltigt kund-ID.'),{status:400,code:'validation_error'});return id;}

export default async(req)=>{
  try{
    requireAdmin(req);const sql=db();const context=await loadContext(sql);
    if(req.method==='GET'){
      const url=new URL(req.url),id=url.searchParams.get('id');
      if(id){
        const safeId=customerId(id);
        const [customer]=await sql`
          SELECT c.id::text,c.name,c.phone,c.email,c.internal_notes,c.visit_count,c.no_show_count,c.first_seen_at,c.last_seen_at,
                 (SELECT count(*)::int FROM reservations r WHERE r.customer_id=c.id) AS reservation_count,
                 (SELECT min(r.starts_at) FROM reservations r WHERE r.customer_id=c.id AND r.status IN ('pending','confirmed','arrived','seated') AND r.starts_at>=now()) AS next_booking,
                 (SELECT max(r.starts_at) FROM reservations r WHERE r.customer_id=c.id AND r.starts_at<now()) AS last_booking
            FROM customers c WHERE c.id=${safeId}::uuid AND c.restaurant_id=${context.restaurant_id}`;
        if(!customer)throw Object.assign(new Error('Gästen hittades inte.'),{status:404,code:'not_found'});
        const reservations=await sql`
          SELECT id::text,confirmation_code,party_size,starts_at,ends_at,status,source,guest_note,internal_note
            FROM reservations WHERE customer_id=${safeId}::uuid ORDER BY starts_at DESC LIMIT 40`;
        return json({ok:true,customer,reservations});
      }
      const q=cleanText(url.searchParams.get('q')||'',80,false),pattern=`%${q}%`;
      const customers=await sql`
        SELECT c.id::text,c.name,c.phone,c.email,c.internal_notes,c.visit_count,c.no_show_count,c.first_seen_at,c.last_seen_at,
               (SELECT count(*)::int FROM reservations r WHERE r.customer_id=c.id) AS reservation_count,
               (SELECT min(r.starts_at) FROM reservations r WHERE r.customer_id=c.id AND r.status IN ('pending','confirmed','arrived','seated') AND r.starts_at>=now()) AS next_booking,
               (SELECT max(r.starts_at) FROM reservations r WHERE r.customer_id=c.id AND r.starts_at<now()) AS last_booking
          FROM customers c
         WHERE c.restaurant_id=${context.restaurant_id}
           AND (${q}='' OR c.name ILIKE ${pattern} OR COALESCE(c.phone,'') ILIKE ${pattern} OR COALESCE(c.email,'') ILIKE ${pattern})
         ORDER BY c.last_seen_at DESC, c.created_at DESC
         LIMIT 50`;
      return json({ok:true,customers,query:q});
    }
    requireSameOrigin(req);const body=await readJson(req);
    if(body.action==='note'){
      const id=customerId(body.id),note=cleanText(body.note,1500,false)||null;
      return sql.begin(async tx=>{
        const [customer]=await tx`UPDATE customers SET internal_notes=${note},last_seen_at=last_seen_at WHERE id=${id}::uuid AND restaurant_id=${context.restaurant_id} RETURNING id::text,name,internal_notes`;
        if(!customer)throw Object.assign(new Error('Gästen hittades inte.'),{status:404,code:'not_found'});
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','customer.note_updated','customer',${customer.id})`;
        return json({ok:true,customer});
      });
    }
    throw Object.assign(new Error('Åtgärden stöds inte.'),{status:400,code:'unsupported_action'});
  }catch(error){return safeError(error);}
};
export const config={path:'/api/admin/customers',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
