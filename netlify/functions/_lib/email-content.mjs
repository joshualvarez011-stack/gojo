// Pure email policy and rendering helpers. No secrets or requests in this module.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function emailPermission(env, recipient) {
  if (!recipient) return { allowed:false, reason:'no_email' };
  if (!env.RESEND_API_KEY || !env.GOJO_EMAIL_FROM) return { allowed:false, reason:'not_configured' };
  // CONTEXT and DEPLOY_PRIME_URL are build variables and cannot be relied on
  // in Netlify Functions. Sending requires an explicit deploy-scoped mode.
  if (env.GOJO_EMAIL_MODE === 'production') return { allowed:true };
  const allowed = (env.GOJO_EMAIL_TEST_RECIPIENTS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (env.GOJO_EMAIL_MODE === 'preview' && env.GOJO_ENABLE_PREVIEW_EMAILS === 'true' &&
      allowed.includes(String(recipient).trim().toLowerCase())) return { allowed:true };
  return { allowed:false, reason:'preview_protected' };
}

// Trusted configured origins only; never assemble a private access link from request Host headers.
export function emailBaseUrl(env) {
  const source = env.GOJO_EMAIL_MODE === 'production'
    ? (env.GOJO_PUBLIC_BASE_URL || env.URL)
    : env.GOJO_EMAIL_MODE === 'preview' ? env.GOJO_PREVIEW_BASE_URL : null;
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (env.GOJO_EMAIL_MODE === 'preview') {
      // Limit preview links to this Netlify site and a specific PR hostname.
      if (!/^[a-z0-9-]+$/i.test(env.SITE_NAME || '')) return null;
      const expected = new RegExp('^deploy-preview-\\d+--' + env.SITE_NAME + '\\.netlify\\.app$', 'i');
      if (!expected.test(url.hostname)) return null;
    }
    return url.origin;
  } catch { return null; }
}

export function buildBookingEmail(row, eventType, manageToken, baseUrl) {
  const descriptions = {
    booking_created: 'Din bokning är bekräftad.',
    booking_modified: 'Din bokning har ändrats.',
    booking_cancelled: 'Din bokning har avbokats.'
  };
  const subjects = {
    booking_created: 'Din bokning hos GOJO är bekräftad',
    booking_modified: 'Din bokning hos GOJO har ändrats',
    booking_cancelled: 'Din bokning hos GOJO är avbokad'
  };
  if (!descriptions[eventType]) throw new Error('Unsupported email event');
  const when = new Intl.DateTimeFormat('sv-SE',{ timeZone:row.timezone||'Europe/Stockholm',dateStyle:'full',timeStyle:'short' }).format(new Date(row.starts_at));
  const manageUrl = manageToken && baseUrl && eventType !== 'booking_cancelled'
    ? baseUrl + '/hantera-bokning.html#code=' + encodeURIComponent(row.confirmation_code) +
      '&token=' + encodeURIComponent(manageToken)
    : null;
  const guests = Number(row.party_size) + (Number(row.party_size) === 1 ? ' gäst' : ' gäster');
  const intro = descriptions[eventType];
  const title = row.restaurant_name || 'GOJO';
  const reference = row.confirmation_code;
  const support = row.restaurant_email || 'info@gojorestaurang.se';
  const text = [
    title, '', intro, '',
    when, guests, 'Bokningsreferens: ' + reference,
    manageUrl ? '\nÄndra eller avboka med din personliga länk:\n' + manageUrl + '\n\nHåll länken privat.' : '',
    '\nFrågor? Kontakta ' + support
  ].filter(Boolean).join('\n');
  const button = manageUrl
    ? '<p style="margin:26px 0"><a href="' + esc(manageUrl) +
      '" style="background:#b95f30;color:white;padding:14px 22px;border-radius:30px;text-decoration:none;font-family:Arial,sans-serif;font-size:14px">Ändra eller avboka bokning</a></p>' +
      '<p style="font-size:12px;color:#675b51">Den här personliga länken ger åtkomst till bokningen. Dela den inte med andra.</p>'
    : '';
  const html = '<!doctype html><html lang="sv"><body style="background:#f6f0e6;margin:0;padding:28px 10px">' +
    '<main style="max-width:550px;margin:auto;background:#fffaf2;padding:34px;border-radius:18px;color:#17110d">' +
    '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:44px;margin:0 0 20px">' + esc(title) + '</h1>' +
    '<p style="font-family:Arial,sans-serif;font-size:17px">' + esc(intro) + '</p>' +
    '<section style="background:#f1e7d8;padding:22px;border-radius:12px;font-family:Arial,sans-serif;line-height:1.9">' +
    '<strong>' + esc(when) + '</strong><br>' + esc(guests) +
    '<br>Bokningsreferens: <strong>' + esc(reference) + '</strong></section>' +
    button + '<p style="font-family:Arial,sans-serif;font-size:12px;color:#675b51">Frågor? Kontakta ' +
    esc(support) + '.</p></main></body></html>';
  return { subject: subjects[eventType], html, text, manageUrl };
}
