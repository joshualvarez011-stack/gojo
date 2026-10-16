import { getPublicRestaurantInfo } from './_lib/booking-service.mjs';
import { json, safeError } from './_lib/http.mjs';

export default async (req) => {
  if (req.method !== 'GET') return json({ ok:false,error:'method_not_allowed' },405);
  try {
    const info = await getPublicRestaurantInfo();
    return json({ ok:true, restaurant: info });
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/restaurant', method:'GET', rateLimit:{ windowLimit:60, windowSize:60, aggregateBy:['ip','domain'] } };
