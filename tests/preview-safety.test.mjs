import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bookingPage=readFileSync('boka.html','utf8');
const bookingScript=readFileSync('js/booking.js','utf8');
const managePage=readFileSync('hantera-bokning.html','utf8');
const manageScript=readFileSync('js/manage-booking.js','utf8');

test('preview booking warns before collecting guest data',()=>{
  assert.match(bookingPage,/id="previewBanner"/);
  assert.match(bookingPage,/separat testdatabas/);
  assert.match(bookingScript,/deploy-preview-/);
  assert.match(bookingScript,/previewBanner\.hidden=false/);
});
test('preview booking success cannot look like a live restaurant confirmation',()=>{
  assert.match(bookingScript,/Testbokning skapad\./);
  assert.match(bookingScript,/INTE en bokning hos restaurangen/);
  assert.doesNotMatch(bookingPage,/preview-läget endast en simulering/);
});
test('booking management shows preview isolation warning',()=>{
  assert.match(managePage,/managePreviewBanner/);
  assert.match(manageScript,/managePreviewBanner/);
});