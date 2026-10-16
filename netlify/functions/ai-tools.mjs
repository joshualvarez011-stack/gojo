import { checkAvailability, createReservation, findManagedReservation, cancelManagedReservation, getPublicRestaurantInfo } from './_lib/booking-service.mjs';
import { loadContext } from './_lib/booking-service.mjs';
import { db } from './_lib/db.mjs';
import { validateReservationInput, validateDate, validateParty, cleanText } from './_lib/validation.mjs';
import { json, readJson, safeError } from './_lib/http.mjs';
import { timingSafeEqual } from 'node:crypto';

function requireAiKey(req){
  const secret=process.env.GOJO_AI_TOOL_SECRET; if(!secret) throw Object.assign(new Error('AI tools är inte aktiverade.'),{status:503,code:'ai_not_configured'});
  const given=req.headers.get('x-gojo-ai-secret')||''; const a=Buffer.from(given); const b=Buffer.from(secret);
  if(a.length!==b.length||!timingSafeEqual(a,b)) throw Object.assign(new Error('Unauthorized'),{status:401,code:'unauthorized'});
}

export default async(req)=>{
  try{
    requireAiKey(req); const body=await readJson(req); const action=String(body.action||'');
    if(action==='getRestaurantInformation') return json({ok:true,result:await getPublicRestaurantInfo()});
    if(action==='checkAvailability') return json({ok:true,result:await checkAvailability({date:validateDate(body.date),partySize:validateParty(body.partySize,1,30)})});
    if(action==='createReservation'){
      const context=await loadContext(db()); const guest=validateReservationInput({...body,privacyAccepted:true},context);
      return json({ok:true,result:await createReservation(guest,'phone_ai')},201);
    }
    if(action==='findReservation'){
      const result=await findManagedReservation(cleanText(body.code,30,true).toUpperCase(),cleanText(body.manageToken,200,true)); return json({ok:true,result});
    }
    if(action==='cancelReservation'){
      const result=await cancelManagedReservation(cleanText(body.code,30,true).toUpperCase(),cleanText(body.manageToken,200,true)); return json({ok:true,result});
    }
    throw Object.assign(new Error('Unknown AI tool action'),{status:400,code:'unknown_action'});
  }catch(error){return safeError(error);}
};
export const config={path:'/api/ai/tools',method:'POST',rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
