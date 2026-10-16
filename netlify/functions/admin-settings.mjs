import { db } from './_lib/db.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { localDateTime } from './_lib/booking-context.mjs';
import { requireAdmin, requireSameOrigin } from './_lib/auth.mjs';
import { readJson, json, safeError } from './_lib/http.mjs';
import { cleanText, validateDate, validateTime } from './_lib/validation.mjs';

const invalid=(message)=>{throw Object.assign(new Error(message),{status:400,code:'validation_error'});};
const int=(v,min,max,name)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)invalid(`${name} är ogiltigt.`);return n;};
const num=(v,min,max,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)invalid(`${name} är ogiltigt.`);return n;};

export default async(req)=>{
  try{
    requireAdmin(req);const sql=db();const context=await loadContext(sql);
    if(req.method==='GET'){
      const [rules,hours,tables,specialHours,blocks]=await Promise.all([
        sql`SELECT * FROM booking_rules WHERE location_id=${context.location_id}`,
        sql`SELECT id::text,weekday,opens_at::text,closes_at::text,closed,note,source,valid_from,valid_until FROM opening_hours WHERE location_id=${context.location_id} ORDER BY weekday,valid_from DESC NULLS LAST`,
        sql`SELECT id::text,code,label,min_capacity,max_capacity,x,y,width,height,shape,active,is_development_default FROM dining_tables WHERE location_id=${context.location_id} ORDER BY code`,
        sql`SELECT id::text,service_date::text,opens_at::text,closes_at::text,closed,note FROM special_opening_hours WHERE location_id=${context.location_id} AND service_date>=CURRENT_DATE-7 ORDER BY service_date LIMIT 120`,
        sql`SELECT bp.id::text,bp.starts_at,bp.ends_at,bp.reason,bp.table_id::text,dt.code AS table_code,dt.label AS table_label FROM blocked_periods bp LEFT JOIN dining_tables dt ON dt.id=bp.table_id WHERE bp.location_id=${context.location_id} AND bp.ends_at>=now()-interval '1 day' ORDER BY bp.starts_at LIMIT 200`
      ]);
      return json({ok:true,rules,hours,tables,specialHours,blocks});
    }
    requireSameOrigin(req);
    const body=await readJson(req);
    if(body.action==='rules'){
      const r=body.rules||{};
      const slotInterval=int(r.slotIntervalMinutes,5,120,'Bokningsintervall');
      const duration=int(r.defaultDurationMinutes,30,480,'Sittningstid');
      const bufferBefore=int(r.bufferBeforeMinutes,0,120,'Buffer före');
      const bufferAfter=int(r.bufferAfterMinutes,0,120,'Buffer efter');
      const minParty=int(r.minPartySize,1,50,'Minsta sällskap');
      const maxOnline=int(r.maxOnlinePartySize,1,50,'Max online');
      const largeThreshold=int(r.largePartyThreshold,2,100,'Gräns för stora sällskap');
      const minLead=int(r.minLeadMinutes,0,10080,'Framförhållning');
      const maxAdvance=int(r.maxAdvanceDays,1,730,'Bokningshorisont');
      const grace=int(r.gracePeriodMinutes,0,120,'Grace period');
      if(minParty>maxOnline)invalid('Minsta sällskap kan inte vara större än max online.');
      if(largeThreshold<=maxOnline)invalid('Gränsen för stora sällskap måste ligga över maxstorleken som kan bokas online.');
      return sql.begin(async tx=>{
        const [updated]=await tx`UPDATE booking_rules SET slot_interval_minutes=${slotInterval},default_duration_minutes=${duration},buffer_before_minutes=${bufferBefore},buffer_after_minutes=${bufferAfter},min_party_size=${minParty},max_online_party_size=${maxOnline},large_party_threshold=${largeThreshold},min_lead_minutes=${minLead},max_advance_days=${maxAdvance},grace_period_minutes=${grace},is_development_default=false,updated_at=now() WHERE location_id=${context.location_id} RETURNING *`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','booking_rules.updated','booking_rules',${updated.id})`;
        return json({ok:true,rules:updated});
      });
    }
    if(body.action==='hours'){
      const weekday=int(body.weekday,1,7,'Veckodag'),closed=Boolean(body.closed);
      const opensAt=closed?null:validateTime(body.opensAt),closesAt=closed?null:validateTime(body.closesAt);
      const note=cleanText(body.note,200,false)||null;
      return sql.begin(async tx=>{
        await tx`UPDATE opening_hours SET valid_until=CURRENT_DATE-1 WHERE location_id=${context.location_id} AND weekday=${weekday} AND valid_from IS NOT NULL AND valid_from<CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)`;
        const [updated]=await tx`INSERT INTO opening_hours (location_id,weekday,opens_at,closes_at,closed,note,source,valid_from) VALUES (${context.location_id},${weekday},${opensAt},${closesAt},${closed},${note},'admin',CURRENT_DATE) ON CONFLICT (location_id,weekday,valid_from) DO UPDATE SET opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at,closed=EXCLUDED.closed,note=EXCLUDED.note,source='admin',valid_until=NULL RETURNING *`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','opening_hours.updated','opening_hours',${updated.id})`;
        return json({ok:true,hours:updated});
      });
    }
    if(body.action==='specialHours'){
      const serviceDate=validateDate(body.date),closed=Boolean(body.closed);
      const opensAt=closed?null:validateTime(body.opensAt),closesAt=closed?null:validateTime(body.closesAt);
      if(!closed&&opensAt===closesAt)invalid('Specialöppettidens öppning och stängning kan inte vara samma tid.');
      const note=cleanText(body.note,200,false)||null;
      return sql.begin(async tx=>{
        const [updated]=await tx`INSERT INTO special_opening_hours (location_id,service_date,opens_at,closes_at,closed,note) VALUES (${context.location_id},${serviceDate}::date,${opensAt},${closesAt},${closed},${note}) ON CONFLICT (location_id,service_date) DO UPDATE SET opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at,closed=EXCLUDED.closed,note=EXCLUDED.note,updated_at=now() RETURNING id::text,service_date::text,opens_at::text,closes_at::text,closed,note`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','special_hours.updated','special_opening_hours',${updated.id},${JSON.stringify({date:serviceDate,closed})}::jsonb)`;
        return json({ok:true,specialHours:updated});
      });
    }
    if(body.action==='removeSpecialHours'){
      const id=cleanText(body.id,80,true);
      return sql.begin(async tx=>{
        const [deleted]=await tx`DELETE FROM special_opening_hours WHERE id=${id}::uuid AND location_id=${context.location_id} RETURNING id::text,service_date::text`;
        if(!deleted)throw Object.assign(new Error('Specialdagen hittades inte.'),{status:404,code:'not_found'});
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','special_hours.removed','special_opening_hours',${deleted.id},${JSON.stringify({date:deleted.service_date})}::jsonb)`;
        return json({ok:true,removed:deleted.id});
      });
    }
    if(body.action==='block'){
      const date=validateDate(body.date),starts=validateTime(body.startsAt),ends=validateTime(body.endsAt),reason=cleanText(body.reason,300,false)||null;
      const endDayOffset=ends<=starts?1:0;
      const startsAt=new Date(await localDateTime(sql,date,starts,context.timezone,0));
      const endsAt=new Date(await localDateTime(sql,date,ends,context.timezone,endDayOffset));
      if(endsAt<=startsAt||endsAt-startsAt>86400000)invalid('Blockeringens tidsintervall är ogiltigt.');
      let tableId=null;
      if(body.tableId){
        const candidate=cleanText(body.tableId,80,true);
        const [table]=await sql`SELECT id::text FROM dining_tables WHERE id=${candidate}::uuid AND location_id=${context.location_id}`;
        if(!table)throw Object.assign(new Error('Bordet hittades inte.'),{status:404,code:'not_found'});
        tableId=table.id;
      }
      return sql.begin(async tx=>{
        const [block]=await tx`INSERT INTO blocked_periods (location_id,table_id,starts_at,ends_at,reason) VALUES (${context.location_id},${tableId}::uuid,${startsAt},${endsAt},${reason}) RETURNING id::text,table_id::text,starts_at,ends_at,reason`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','blocked_period.created','blocked_period',${block.id},${JSON.stringify({tableId,date,starts,ends})}::jsonb)`;
        return json({ok:true,block});
      });
    }
    if(body.action==='unblock'){
      const id=cleanText(body.id,80,true);
      return sql.begin(async tx=>{
        const [deleted]=await tx`DELETE FROM blocked_periods WHERE id=${id}::uuid AND location_id=${context.location_id} RETURNING id::text`;
        if(!deleted)throw Object.assign(new Error('Blockeringen hittades inte.'),{status:404,code:'not_found'});
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','blocked_period.removed','blocked_period',${deleted.id})`;
        return json({ok:true,removed:deleted.id});
      });
    }
    if(body.action==='table'){
      const id=cleanText(body.id,80,true),shape=['rectangle','round','square','bar'].includes(body.shape)?body.shape:'rectangle';
      const minCapacity=int(body.minCapacity,1,50,'Min kapacitet'),maxCapacity=int(body.maxCapacity,1,50,'Max kapacitet');
      const x=num(body.x,0,95,'X'),y=num(body.y,0,95,'Y'),width=num(body.width,4,60,'Bredd'),height=num(body.height,4,60,'Höjd');
      if(minCapacity>maxCapacity)invalid('Minsta bordskapacitet kan inte vara större än maxkapaciteten.');
      if(x+width>100||y+height>100)invalid('Bordet måste rymmas inom bordskartan.');
      return sql.begin(async tx=>{
        const [updated]=await tx`UPDATE dining_tables SET label=${cleanText(body.label,80,true)},min_capacity=${minCapacity},max_capacity=${maxCapacity},x=${x},y=${y},width=${width},height=${height},shape=${shape},active=${body.active!==false},is_development_default=false,updated_at=now() WHERE id=${id}::uuid AND location_id=${context.location_id} RETURNING *`;
        if(!updated)throw Object.assign(new Error('Bordet hittades inte.'),{status:404});
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','table.updated','table',${updated.id})`;
        return json({ok:true,table:updated});
      });
    }
    throw Object.assign(new Error('Åtgärden stöds inte.'),{status:400,code:'unsupported_action'});
  }catch(error){return safeError(error);}
};
export const config={path:'/api/admin/settings',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
