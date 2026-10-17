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
test('personal link loads directly without a manual code or token form',()=>{
  assert.doesNotMatch(page, /name="token"/);
  assert.doesNotMatch(page, /id="manageLookup"/);
  assert.match(page, /id="missingLink"/);
  assert.match(script, /hasPersonalLink/);
  assert.match(script, /history\.replaceState/);
});
