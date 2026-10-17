import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync('hantera-bokning.html','utf8');
const css=readFileSync('css/booking.css','utf8');
const script=readFileSync('js/manage-booking.js','utf8');
test('management hero has its own typography spacing',()=>{
  assert.match(page,/page-hero book booking-hero manage-hero/);
  assert.match(css,/\.manage-hero \.page-hero-content\{display:flex;flex-direction:column/);
  assert.match(css,/\.manage-hero \.page-hero-content h1\{[^}]*line-height:1\.08/);
});
test('deep-linked booking opens without exposing private token in the default form',()=>{
  assert.match(page,/name="token" type="password"/);
  assert.match(page,/id="manageSwitch"/);
  assert.match(script,/if\(linkedReservation\)\{form\.hidden=true/);
});
