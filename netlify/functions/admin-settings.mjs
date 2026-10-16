import { db } from './_lib/db.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { requireAdmin } from './_lib/auth.mjs';
import { readJson, json, safeError } from './_lib/http.mjs';
import { cleanText, validateTime } from './_lib/validation.mjs';

const int=(v,min,max,name)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw Object.assign(new Error(`${name} är ogiltigt.`),{status:400,code:'validation_error'});return n;};
const num=(v,min,max,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Object.assign(new Error(`${name} är ogiltigt.`),{status:400,code:'validation_error'});return n;};

export default async(req)=>{
  try{
    requireAdmin(req);const sql=db();const context=await loadContext(sql);
    if(req.method==='GET'){
      const [rules]=await sql`SELECT * FROM booking_rules WHERE location_id=${context.location_id}`;
      const hours=await sql`SELECT id::text,weekday,opens_at::text,closes_at::text,closed,note,source,valid_from FROM opening_hours WHERE location_id=${context.location_id} ORDER BY weekday,valid_from DESC NULLS LAST`;
      const tables=await sql`SELECT id::text,code,label,min_capacity,max_capacity,x,y,width,height,shape,active,is_development_default FROM dining_tables WHERE location_id=${context.location_id} ORDER BY code`;
      return json({ok:true,rules,hours,tables});
    }
    const body=await readJson(req);
    if(body.action==='rules'){
      const r=body.rules||{};
      const [updated]=await sql`UPDATE booking_rules SET
        slot_interval_minutes=${int(r.slotIntervalMinutes,5,120,'Bokningsintervall')},
        default_duration_minutes=${int(r.defaultDurationMinutes,30,480,'Sittningstid')},
        buffer_before_minutes=${int(r.bufferBeforeMinutes,0,120,'Buffer före')},
        buffer_after_minutes=${int(r.bufferAfterMinutes,0,120,'Buffer efter')},
        min_party_size=${int(r.minPartySize,1,50,'Minsta sällskap')},
        max_online_party_size=${int(r.maxOnlinePartySize,1,50,'Max online')},
        large_party_threshold=${int(r.largePartyThreshold,2,100,'Gräns för stora sällskap')},
        min_lead_minutes=${int(r.minLeadMinutes,0,10080,'Framförhållning')},
        max_advance_days=${int(r.maxAdvanceDays,1,730,'Bokningshorisont')},
        grace_period_minutes=${int(r.gracePeriodMinutes,0,120,'Grace period')},
        is_development_default=false,updated_at=now()
        WHERE location_id=${context.location_id} RETURNING *`;
      await sql`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','booking_rules.updated','booking_rules',${updated.id})`;
      return json({ok:true,rules:updated});
    }
    if(body.action==='hours'){
      const weekday=int(body.weekday,1,7,'Veckodag'),closed=Boolean(body.closed);
      const opensAt=closed?null:validateTime(body.opensAt),closesAt=closed?null:validateTime(body.closesAt);
      const [row]=await sql`SELECT id FROM opening_hours WHERE location_id=${context.location_id} AND weekday=${weekday} ORDER BY valid_from DESC NULLS LAST LIMIT 1`;
      let updated;
      if(row){[updated]=await sql`UPDATE opening_hours SET opens_at=${opensAt},closes_at=${closesAt},closed=${closed},note=${cleanText(body.note,200,false)||null},source='admin' WHERE id=${row.id} RETURNING *`;}
      else{[updated]=await sql`INSERT INTO opening_hours (location_id,weekday,opens_at,closes_at,closed,note,source,valid_from) VALUES (${context.location_id},${weekday},${opensAt},${closesAt},${closed},${cleanText(body.note,200,false)||null},'admin',CURRENT_DATE) RETURNING *`;}
      await sql`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','opening_hours.updated','opening_hours',${updated.id})`;
      return json({ok:true,hours:updated});
    }
    if(body.action==='table'){
      const id=cleanText(body.id,80,true),shape=['rectangle','round','square','bar'].includes(body.shape)?body.shape:'rectangle';
      const [updated]=await sql`UPDATE dining_tables SET label=${cleanText(body.label,80,true)},min_capacity=${int(body.minCapacity,1,50,'Min kapacitet')},max_capacity=${int(body.maxCapacity,1,50,'Max kapacitet')},x=${num(body.x,0,95,'X')},y=${num(body.y,0,95,'Y')},width=${num(body.width,4,60,'Bredd')},height=${num(body.height,4,60,'Höjd')},shape=${shape},active=${body.active!==false},is_development_default=false,updated_at=now() WHERE id=${id}::uuid AND location_id=${context.location_id} RETURNING *`;
      if(!updated)throw Object.assign(new Error('Bordet hittades inte.'),{status:404});
      await sql`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','table.updated','table',${updated.id})`;
      return json({ok:true,table:updated});
    }
    throw Object.assign(new Error('Åtgärden stöds inte.'),{status:400,code:'unsupported_action'});
  }catch(error){return safeError(error);}
};
export const config={path:'/api/admin/settings',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
