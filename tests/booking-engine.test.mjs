import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocalSlots, chooseBestTableSet, overlap, busyTablesForRange } from '../netlify/functions/_lib/booking-engine.mjs';

const tables=[
  {id:'t2',code:'T2',min_capacity:1,max_capacity:2,active:true},
  {id:'t4',code:'T4',min_capacity:2,max_capacity:4,active:true},
  {id:'t6',code:'T6',min_capacity:2,max_capacity:6,active:true}
];
const combinations=[{id:'c',code:'C24',min_capacity:5,max_capacity:6,active:true,priority:50,table_ids:['t2','t4']}];

test('picks smallest suitable single table',()=>{
  assert.equal(chooseBestTableSet({tables,combinations,busyTableIds:[],partySize:2}).code,'T2');
  assert.equal(chooseBestTableSet({tables,combinations,busyTableIds:[],partySize:4}).code,'T4');
});

test('uses combination when best fitting option',()=>{
  const choice=chooseBestTableSet({tables,combinations,busyTableIds:['t6'],partySize:5});
  assert.equal(choice.code,'C24');
  assert.deepEqual(choice.tableIds,['t2','t4']);
});

test('never uses a combination containing a busy table',()=>{
  const choice=chooseBestTableSet({tables,combinations,busyTableIds:['t2','t6'],partySize:5});
  assert.equal(choice,null);
});

test('generates slots that fit the full sitting duration',()=>{
  const slots=generateLocalSlots({opensAt:'16:00:00',closesAt:'23:00:00',intervalMinutes:30,durationMinutes:120});
  assert.equal(slots[0].time,'16:00');
  assert.equal(slots.at(-1).time,'21:00');
  assert.equal(slots.length,11);
});

test('handles closing at midnight',()=>{
  const slots=generateLocalSlots({opensAt:'16:00:00',closesAt:'00:00:00',intervalMinutes:30,durationMinutes:120});
  assert.equal(slots.at(-1).time,'22:00');
  assert.equal(slots.at(-1).dayOffset,0);
});

test('overlap uses half-open intervals',()=>{
  assert.equal(overlap('2026-10-16T18:00:00Z','2026-10-16T20:00:00Z','2026-10-16T20:00:00Z','2026-10-16T21:00:00Z'),false);
  assert.equal(overlap('2026-10-16T18:00:00Z','2026-10-16T20:00:00Z','2026-10-16T19:59:00Z','2026-10-16T21:00:00Z'),true);
});

test('collects busy tables for a requested range',()=>{
  const busy=busyTablesForRange([
    {table_id:'t2',starts_at:'2026-10-16T18:00:00Z',ends_at:'2026-10-16T20:00:00Z',active:true},
    {table_id:'t4',starts_at:'2026-10-16T20:00:00Z',ends_at:'2026-10-16T22:00:00Z',active:true}
  ],'2026-10-16T19:00:00Z','2026-10-16T20:00:00Z');
  assert.deepEqual([...busy],['t2']);
});
