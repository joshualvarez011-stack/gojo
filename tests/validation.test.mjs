import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeEmail, validateDate, validateParty } from '../netlify/functions/_lib/validation.mjs';

test('normalizes Swedish mobile numbers',()=>assert.equal(normalizePhone('073-747 04 91'),'+46737470491'));
test('normalizes email',()=>assert.equal(normalizeEmail(' TEST@Example.COM '),'test@example.com'));
test('rejects impossible date',()=>assert.throws(()=>validateDate('2026-02-31')));
test('enforces party limits',()=>assert.throws(()=>validateParty(9,1,8)));
