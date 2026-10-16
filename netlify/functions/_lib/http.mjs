export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

export async function readJson(req, maxBytes = 20_000) {
  const length = Number(req.headers.get('content-length') || 0);
  if (length > maxBytes) throw Object.assign(new Error('Payload too large'), { status: 413 });
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Payload too large'), { status: 413 });
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('Ogiltig JSON'), { status: 400 }); }
}

export function methodNotAllowed() {
  return json({ ok: false, error: 'method_not_allowed' }, 405, { allow: 'GET, POST' });
}

export function safeError(error) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(error);
  return json({
    ok: false,
    error: error?.code || (status >= 500 ? 'server_error' : 'request_error'),
    message: status >= 500 ? 'Något gick fel. Försök igen.' : error.message
  }, status);
}
