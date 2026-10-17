import { verifyPassword, createSession, sessionCookie, clearSessionCookie, requireAdmin, requireSameOrigin } from './_lib/auth.mjs';
import { readJson, json, safeError } from './_lib/http.mjs';

export default async (req) => {
  try {
    if (req.method === 'GET') {
      const session = requireAdmin(req);
      return json({ok:true,session:{role:session.role}});
    }
    requireSameOrigin(req);
    const body = await readJson(req,5000);
    if (body.action === 'logout') return json({ok:true},200,{'set-cookie':clearSessionCookie()});
    if (!process.env.GOJO_ADMIN_PASSWORD_HASH) throw Object.assign(new Error('Admininloggning är inte konfigurerad ännu.'),{status:503,code:'admin_not_configured'});
    if (!verifyPassword(body.password)) throw Object.assign(new Error('Fel lösenord.'),{status:401,code:'invalid_credentials'});
    const session = createSession('admin');
    return json({ok:true},200,{'set-cookie':sessionCookie(session)});
  } catch (error) { return safeError(error); }
};
export const config = { path:'/api/admin/session', rateLimit:{ windowLimit:12, windowSize:60, aggregateBy:['ip','domain'] } };
