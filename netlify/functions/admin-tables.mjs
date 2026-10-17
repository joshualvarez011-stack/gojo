import { db } from './_lib/db.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { requireAdmin, requireSameOrigin } from './_lib/auth.mjs';
import { readJson, json, safeError } from './_lib/http.mjs';
import { cleanText } from './_lib/validation.mjs';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_RE=/^[A-Z0-9_-]{1,20}$/;
const invalid=(message)=>{throw Object.assign(new Error(message),{status:400,code:'validation_error'});};
const int=(v,min,max,name)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)invalid(`${name} är ogiltigt.`);return n;};
const num=(v,min,max,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)invalid(`${name} är ogiltigt.`);return n;};
function tableCode(v){const code=cleanText(v,20,true).toUpperCase();if(!CODE_RE.test(code))invalid('Bordskoden får bara innehålla A–Z, siffror, bindestreck och underscore.');return code;}
function uuid(v,name='ID'){const id=cleanText(v,80,true);if(!UUID_RE.test(id))invalid(`${name} är ogiltigt.`);return id;}
function shape(v){return ['rectangle','round','square','bar'].includes(v)?v:'rectangle';}

async function snapshot(sql,context){
  const tables=await sql`SELECT id::text,code,label,min_capacity,max_capacity,x,y,width,height,shape,active,is_development_default FROM dining_tables WHERE location_id=${context.location_id} ORDER BY code`;
  const combinations=await sql`
    SELECT tc.id::text,tc.code,tc.label,tc.min_capacity,tc.max_capacity,tc.priority,tc.active,tc.is_development_default,
           COALESCE(array_agg(tcm.table_id::text ORDER BY dt.code) FILTER (WHERE tcm.table_id IS NOT NULL),ARRAY[]::text[]) AS table_ids,
           COALESCE(string_agg(dt.code, ' + ' ORDER BY dt.code),'') AS table_codes
      FROM table_combinations tc
      LEFT JOIN table_combination_members tcm ON tcm.combination_id=tc.id
      LEFT JOIN dining_tables dt ON dt.id=tcm.table_id
     WHERE tc.location_id=${context.location_id}
     GROUP BY tc.id ORDER BY tc.priority,tc.code`;
  return {tables,combinations};
}

export default async(req)=>{
  try{
    requireAdmin(req);const sql=db();const context=await loadContext(sql);
    if(req.method==='GET')return json({ok:true,...await snapshot(sql,context)});
    requireSameOrigin(req);const body=await readJson(req);const action=String(body.action||'');

    if(action==='createTable'){
      const code=tableCode(body.code),label=cleanText(body.label,80,true),minCapacity=int(body.minCapacity,1,50,'Min kapacitet'),maxCapacity=int(body.maxCapacity,1,50,'Max kapacitet');
      if(minCapacity>maxCapacity)invalid('Min kapacitet kan inte vara större än maxkapacitet.');
      const x=num(body.x??5,0,95,'X'),y=num(body.y??5,0,95,'Y'),width=num(body.width??18,4,60,'Bredd'),height=num(body.height??14,4,60,'Höjd');
      if(x+width>100||y+height>100)invalid('Bordet måste rymmas inom bordskartan.');
      return sql.begin(async tx=>{
        const [existing]=await tx`SELECT id FROM dining_tables WHERE location_id=${context.location_id} AND upper(code)=${code}`;
        if(existing)throw Object.assign(new Error('Bordskoden används redan.'),{status:409,code:'duplicate_code'});
        const [table]=await tx`INSERT INTO dining_tables (location_id,code,label,min_capacity,max_capacity,x,y,width,height,shape,active,is_development_default) VALUES (${context.location_id},${code},${label},${minCapacity},${maxCapacity},${x},${y},${width},${height},${shape(body.shape)},true,false) RETURNING id::text,code,label,min_capacity,max_capacity,x,y,width,height,shape,active`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id) VALUES (${context.restaurant_id},'staff','table.created','table',${table.id})`;
        return json({ok:true,table},201);
      });
    }

    if(action==='setTableActive'){
      const id=uuid(body.id,'Bords-ID'),active=Boolean(body.active);
      return sql.begin(async tx=>{
        const [table]=await tx`UPDATE dining_tables SET active=${active},is_development_default=false,updated_at=now() WHERE id=${id}::uuid AND location_id=${context.location_id} RETURNING id::text,code,label,active`;
        if(!table)throw Object.assign(new Error('Bordet hittades inte.'),{status:404,code:'not_found'});
        if(!active)await tx`UPDATE table_combinations SET active=false WHERE id IN (SELECT combination_id FROM table_combination_members WHERE table_id=${id}::uuid)`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','table.active_changed','table',${table.id},${JSON.stringify({active})}::jsonb)`;
        return json({ok:true,table});
      });
    }

    if(action==='createCombination'){
      const code=tableCode(body.code),label=cleanText(body.label,80,true),ids=[...new Set(Array.isArray(body.tableIds)?body.tableIds:[])].map(v=>uuid(v,'Bords-ID'));
      if(ids.length<2||ids.length>8)invalid('En bordskombination måste innehålla 2–8 bord.');
      const priority=int(body.priority??100,1,1000,'Prioritet');
      return sql.begin(async tx=>{
        const members=await tx`SELECT id::text,code,max_capacity FROM dining_tables WHERE location_id=${context.location_id} AND active AND id=ANY(${ids}::uuid[]) ORDER BY code`;
        if(members.length!==ids.length)invalid('Alla bord i kombinationen måste finnas och vara aktiva.');
        const maxSingle=Math.max(...members.map(t=>Number(t.max_capacity))),sum=members.reduce((n,t)=>n+Number(t.max_capacity),0);
        const minCapacity=body.minCapacity==null?Math.min(sum,maxSingle+1):int(body.minCapacity,1,100,'Min kapacitet');
        const maxCapacity=body.maxCapacity==null?sum:int(body.maxCapacity,1,100,'Max kapacitet');
        if(minCapacity>maxCapacity||maxCapacity>sum)invalid('Kombinationens kapacitet är ogiltig.');
        const [existing]=await tx`SELECT id FROM table_combinations WHERE location_id=${context.location_id} AND upper(code)=${code}`;
        if(existing)throw Object.assign(new Error('Kombinationskoden används redan.'),{status:409,code:'duplicate_code'});
        const [combo]=await tx`INSERT INTO table_combinations (location_id,code,label,min_capacity,max_capacity,priority,active,is_development_default) VALUES (${context.location_id},${code},${label},${minCapacity},${maxCapacity},${priority},true,false) RETURNING id::text,code,label,min_capacity,max_capacity,priority,active`;
        for(const table of members)await tx`INSERT INTO table_combination_members (combination_id,table_id) VALUES (${combo.id}::uuid,${table.id}::uuid)`;
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','table_combination.created','table_combination',${combo.id},${JSON.stringify({tableIds:ids})}::jsonb)`;
        return json({ok:true,combination:{...combo,table_ids:members.map(t=>t.id),table_codes:members.map(t=>t.code).join(' + ')}},201);
      });
    }

    if(action==='setCombinationActive'){
      const id=uuid(body.id,'Kombinations-ID'),active=Boolean(body.active);
      return sql.begin(async tx=>{
        if(active){const [{all_active,count}]=await tx`SELECT bool_and(dt.active) AS all_active,count(*)::int AS count FROM table_combination_members m JOIN dining_tables dt ON dt.id=m.table_id WHERE m.combination_id=${id}::uuid AND dt.location_id=${context.location_id}`;if(!count||!all_active)throw Object.assign(new Error('Alla medlemsbord måste vara aktiva först.'),{status:409,code:'inactive_member'});}
        const [combo]=await tx`UPDATE table_combinations SET active=${active},is_development_default=false WHERE id=${id}::uuid AND location_id=${context.location_id} RETURNING id::text,code,label,active`;
        if(!combo)throw Object.assign(new Error('Kombinationen hittades inte.'),{status:404,code:'not_found'});
        await tx`INSERT INTO audit_logs (restaurant_id,actor_type,action,entity_type,entity_id,metadata) VALUES (${context.restaurant_id},'staff','table_combination.active_changed','table_combination',${combo.id},${JSON.stringify({active})}::jsonb)`;
        return json({ok:true,combination:combo});
      });
    }

    throw Object.assign(new Error('Åtgärden stöds inte.'),{status:400,code:'unsupported_action'});
  }catch(error){return safeError(error);}
};
export const config={path:'/api/admin/tables',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
