import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmationCode } from '../netlify/functions/_lib/confirmation-code.mjs';

test('new confirmation references are six-digit, easy to read over the phone',()=>{
  for (let i=0;i<150;i++) assert.match(confirmationCode(),/^GJ-\d{6}$/);
});
test('short-reference collisions retry with database uniqueness, while tokens remain strong',()=>{
  const source=readFileSync('netlify/functions/_lib/reservation-create.mjs','utf8');
  assert.match(source,/ON CONFLICT \(confirmation_code\) DO NOTHING RETURNING/);
  assert.match(source,/for \(let attempt = 0; attempt < 12; attempt\+\+\)/);
  assert.match(source,/function token\(bytes = 24\)/);
});
test('personal link can be copied; private token entry is absent',()=>{
  const page=readFileSync('boka.html','utf8');
  const manage=readFileSync('hantera-bokning.html','utf8');
  const js=readFileSync('js/booking.js','utf8');
  assert.match(page,/id="copyManageLink"/);
  assert.match(js,/navigator\.clipboard\.writeText/);
  assert.match(js,/hantera-bokning\.html#code=/);
  assert.doesNotMatch(manage,/Privat hanteringskod/);
});