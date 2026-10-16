import { db } from './_lib/db.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { json } from './_lib/http.mjs';

export default async () => {
  try {
    const sql=db();
    const context=await loadContext(sql);
    const [schema]=await sql`
      SELECT to_regclass('public.reservations') IS NOT NULL AS reservations_ready,
             to_regclass('public.special_opening_hours') IS NOT NULL AS special_hours_ready`;
    if(!schema?.reservations_ready||!schema?.special_hours_ready) throw new Error('Schema not ready');
    return json({ok:true,database:'ready',restaurant:context.restaurant_slug,location:context.location_slug||'stockholm'});
  } catch(error) {
    console.error('Health check failed',error);
    return json({ok:false,database:'unavailable'},503);
  }
};
export const config={path:'/api/health',method:'GET',rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
