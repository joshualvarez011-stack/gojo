import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emailPermission, emailBaseUrl, buildBookingEmail } from '../netlify/functions/_lib/email-content.mjs';

const creds = { RESEND_API_KEY:'test-key', GOJO_EMAIL_FROM:'GOJO <bookings@example.test>' };
const sample = {
  confirmation_code:'GJ-482731',guest_email:'customer@example.test',
  party_size:2,starts_at:'2026-11-11T17:00:00Z',
  restaurant_name:'GOJO',timezone:'Europe/Stockholm',
  restaurant_email:'info@gojorestaurang.se'
};
test('production sends only with verified-provider configuration',()=>{
  assert.deepEqual(emailPermission({GOJO_EMAIL_MODE:'production'},sample.guest_email),{allowed:false,reason:'not_configured'});
  assert.deepEqual(emailPermission({...creds,GOJO_EMAIL_MODE:'production'},sample.guest_email),{allowed:true});
});
test('preview and unknown contexts fail closed even when secrets exist',()=>{
  assert.equal(emailPermission({...creds,GOJO_EMAIL_MODE:'preview'},sample.guest_email).allowed,false);
  assert.equal(emailPermission({...creds,GOJO_EMAIL_MODE:'dev'},sample.guest_email).allowed,false);
  assert.equal(emailPermission({...creds},sample.guest_email).allowed,false);
});
test('preview opt-in is recipient-specific and case-insensitive',()=>{
  const env={...creds,GOJO_EMAIL_MODE:'preview',GOJO_ENABLE_PREVIEW_EMAILS:'true',GOJO_EMAIL_TEST_RECIPIENTS:'allowed@example.test, SECOND@example.test'};
  assert.equal(emailPermission(env,'CUSTOMER@example.test').allowed,false);
  assert.equal(emailPermission(env,'second@example.test').allowed,true);
  assert.equal(emailPermission({...env,GOJO_ENABLE_PREVIEW_EMAILS:'false'},'allowed@example.test').allowed,false);
});
test('provider is never contacted without an email',()=>{
  assert.equal(emailPermission({...creds,GOJO_EMAIL_MODE:'production'},'').reason,'no_email');
});
test('outbound management links use deployment-provided HTTPS URLs only',()=>{
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'production',URL:'https://gojo-restaurang.netlify.app'}),'https://gojo-restaurang.netlify.app');
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'preview',GOJO_PREVIEW_BASE_URL:'https://deploy-preview-1--gojo-restaurang.netlify.app',SITE_NAME:'gojo-restaurang'}),'https://deploy-preview-1--gojo-restaurang.netlify.app');
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'preview',GOJO_PREVIEW_BASE_URL:'https://evil.example',SITE_NAME:'gojo-restaurang'}),null);
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'preview',GOJO_PREVIEW_BASE_URL:'https://deploy-preview-1--other-site.netlify.app',SITE_NAME:'gojo-restaurang'}),null);
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'preview',GOJO_PREVIEW_BASE_URL:'https://deploy-preview-1--gojo-restaurang.netlify.app'}),null);
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'production',URL:'http://untrusted.example'}),null);
  assert.equal(emailBaseUrl({GOJO_EMAIL_MODE:'dev',URL:'https://gojo-restaurang.netlify.app'}),null);
});
test('confirmation email includes short reference, private fragment link and plaintext fallback',()=>{
  const r=buildBookingEmail(sample,'booking_created','private-token','https://gojo-restaurang.netlify.app');
  assert.match(r.subject,/bekräftad/);
  assert.match(r.html,/GJ-482731/);
  assert.match(r.text,/GJ-482731/);
  assert.match(r.html,/hantera-bokning.html#code=GJ-482731&amp;token=private-token/);
  assert.match(r.text,/#code=GJ-482731&token=private-token/);
});
test('cancellation does not offer a management action',()=>{
  const r=buildBookingEmail(sample,'booking_cancelled','private-token','https://gojo-restaurang.netlify.app');
  assert.match(r.subject,/avbokad/);
  assert.doesNotMatch(r.html,/hantera-bokning/);
  assert.doesNotMatch(r.text,/private-token/);
});
test('guest-controlled fields are escaped in HTML',()=>{
  const r=buildBookingEmail({...sample,restaurant_name:'<script>alert(1)</script>'},'booking_created','abc','https://gojo-restaurang.netlify.app');
  assert.doesNotMatch(r.html,/<script>/);
  assert.match(r.html,/&lt;script&gt;/);
});
test('notification sender uses provider idempotency and preserves booking success on failures',()=>{
  const sender=readFileSync('netlify/functions/_lib/notifications.mjs','utf8');
  const handler=readFileSync('netlify/functions/reservations.mjs','utf8');
  assert.match(sender,/Idempotency-Key/);
  assert.match(sender,/return \{ accepted:false, reason:'notification_error' \}/);
  assert.match(handler,/return json\(\{ ok:true, \.\.\.result, email \},201\)/);
});