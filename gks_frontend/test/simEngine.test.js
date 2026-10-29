import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTSIDE, MISREAD_CARD, canPass, route, createSimulation, step, finished, inside, manualPass, unknownCard, takeReads, settleReads, workAreas } from '../src/utils/simEngine.js';

// The office template: lobby, office, cafeteria, break area.
const area = (ref, type, x, y, w, h) => ({ id: 1, ref, name: ref, type, x, y, w, h });
const door = (id, type, x, y, a, b, active = true) => ({ id, name: type + id, type, active, placed: true, x, y, a, b });
const plan = {
  areas: [area('lobi', 'Lobi', 40, 200, 200, 240), area('ofis', 'Ofis', 240, 40, 480, 400), area('yemek', 'Yemekhane', 240, 440, 300, 200), area('mola', 'Mola', 720, 40, 200, 200)],
  doors: [
    door(1, 'Ana Giriş', 40, 280, null, 'lobi'), door(2, 'Ana Çıkış', 40, 360, null, 'lobi'), door(3, 'İç Geçiş', 240, 280, 'lobi', 'ofis'),
    door(4, 'Yemekhane Giriş', 300, 440, 'ofis', 'yemek'), door(5, 'Yemekhane Çıkış', 440, 440, 'ofis', 'yemek'),
    door(6, 'Mola / Sigara Alanı', 720, 80, 'ofis', 'mola'), door(7, 'İç Geçiş', 720, 200, 'ofis', 'mola'),
  ],
};
const all = [1, 2, 3, 4, 5, 6, 7];
const ids = steps => steps.map(item => item.door.id);
const typeOf = node => plan.areas.find(item => item.ref === node)?.type;

test('directional doors are used only their way; others both ways', () => {
  assert.equal(canPass(plan.doors[0], OUTSIDE, 'lobi', typeOf), true);
  assert.equal(canPass(plan.doors[0], 'lobi', OUTSIDE, typeOf), false);
  assert.equal(canPass(plan.doors[3], 'yemek', 'ofis', typeOf), false);
  assert.equal(canPass(plan.doors[2], 'ofis', 'lobi', typeOf), true);
  // An entry door between two inner areas cannot follow its rule, so it works both ways.
  assert.equal(canPass(door(9, 'Ana Giriş', 0, 0, 'lobi', 'ofis'), 'ofis', 'lobi', typeOf), true);
});

test('routes follow door directions and prefer the break-area door into the break area', () => {
  assert.deepEqual(ids(route(plan, OUTSIDE, 'ofis')), [1, 3]);
  assert.deepEqual(ids(route(plan, 'ofis', OUTSIDE)), [3, 2]);
  assert.deepEqual(ids(route(plan, 'ofis', 'yemek')), [4]);
  assert.deepEqual(ids(route(plan, 'yemek', 'ofis')), [5]);
  assert.deepEqual(ids(route(plan, 'ofis', 'mola')), [6]);
  assert.deepEqual(ids(route(plan, 'mola', 'ofis')), [7]);
  // Unusable doors are avoided while another way exists.
  assert.deepEqual(ids(route(plan, 'ofis', 'mola', item => item.id !== 6)), [7]);
  assert.equal(route({ ...plan, doors: plan.doors.slice(0, 2) }, OUTSIDE, 'ofis'), null);
});

const dayPlan = (person = {}) => ({
  tarih: '2026-09-08',
  kisiler: [
    { id: 1, ad_soyad: 'Ayşe', kart: '30000000001', kapilar: all, gec: false, durum: 'Planlı', olaylar: [
      { tur: 'giris', zaman: '2026-09-08T09:00:00' }, { tur: 'mola', zaman: '2026-09-08T10:30:00' }, { tur: 'moladan_don', zaman: '2026-09-08T10:45:00' },
      { tur: 'yemek', zaman: '2026-09-08T12:30:00' }, { tur: 'yemekten_don', zaman: '2026-09-08T13:15:00' }, { tur: 'cikis', zaman: '2026-09-08T18:00:00' }] },
    { id: 2, ad_soyad: 'Burak', kart: '30000000002', kapilar: [2, 3, 4, 5, 6, 7], gec: false, durum: 'Planlı', olaylar: [{ tur: 'giris', zaman: '2026-09-08T09:05:00' }], ...person },
    { id: 3, ad_soyad: 'Deniz', kart: '30000000004', kapilar: all, gec: false, durum: 'İzinli', olaylar: [] },
  ],
});

test('a day produces the reads attendance needs, in order and on the minute', () => {
  const sim = createSimulation(plan, dayPlan());
  assert.equal(sim.clock, Date.parse('2026-09-08T08:30:00Z'));
  assert.deepEqual(sim.absent, [{ name: 'Deniz', reason: 'İzinli' }]);
  assert.equal(inside(sim), 0);
  while (!finished(sim)) step(sim, 10 * 60000);
  const ayse = sim.feed.filter(entry => entry.personId === 1).reverse();
  assert.deepEqual(ayse.map(entry => entry.doorId), [1, 3, 6, 7, 4, 5, 3, 2]);
  // The side a read comes from: A is the door's first area (null = outside).
  assert.deepEqual(ayse.map(entry => entry.direction), ['A→B', 'A→B', 'A→B', 'B→A', 'A→B', 'B→A', 'B→A', 'B→A']);
  assert.ok(ayse.every(entry => entry.ok));
  assert.ok(ayse[0].at > Date.parse('2026-09-08T09:00:00Z') && ayse[0].at < Date.parse('2026-09-08T09:10:00Z'));
  // Burak has no permission for the main entry: denied and stays outside.
  const burak = sim.feed.filter(entry => entry.personId === 2);
  assert.deepEqual(burak.map(entry => [entry.doorId, entry.ok, entry.reason]), [[1, false, 'Kapı yetkisi yok']]);
  assert.equal(sim.people[1].node, OUTSIDE);
  assert.deepEqual(sim.counts, { ok: 8, denied: 1 });
  const { batch, body } = takeReads(sim, 5);
  assert.equal(batch.length, 5);
  assert.equal(sim.outbox.length, 4);
  assert.equal(body.tarih, '2026-09-08');
  assert.match(body.okutmalar[0].zaman, /^2026-09-08T09:0\d:\d{2}$/);
  assert.equal(body.okutmalar[0].yon, 'A→B');
  settleReads(sim, batch, batch.map(() => ({ basarili: true, neden: 'Geçiş onaylandı' })));
  assert.equal(batch[0].server, true);
});

test('a misread card is denied, then the same door is tried again', () => {
  let calls = 0;
  const sim = createSimulation(plan, { ...dayPlan(), kisiler: dayPlan().kisiler.slice(0, 1) }, { misread: 0.5, random: () => (calls++ === 0 ? 0 : 0.9) });
  step(sim, 60 * 60000);
  const reads = sim.feed.slice().reverse();
  assert.deepEqual(reads.slice(0, 3).map(entry => [entry.doorId, entry.card, entry.ok]), [[1, MISREAD_CARD, false], [1, '30000000001', true], [3, '30000000001', true]]);
  assert.ok(reads[1].at - reads[0].at >= 30000);
});

test('manual passes and unknown cards', () => {
  const sim = createSimulation(plan, dayPlan());
  step(sim, 60 * 60000);
  assert.equal(sim.people[0].node, 'ofis');
  assert.equal(manualPass(sim, 1, 4), null);
  step(sim, 10 * 60000);
  assert.equal(sim.people[0].node, 'yemek');
  // Burak is outside; trying the entry again is denied again.
  assert.equal(manualPass(sim, 2, 1), null);
  step(sim, 5 * 60000);
  assert.deepEqual([sim.feed[0].personId, sim.feed[0].ok], [2, false]);
  assert.match(manualPass(sim, 1, 99), /planda değil/);
  const entry = unknownCard(sim, 3);
  assert.deepEqual([entry.ok, entry.reason, entry.card.startsWith('TANIMSIZ-')], [false, 'Tanımsız kart', true]);
});

test('people work in office areas first', () => {
  assert.deepEqual(workAreas(plan.areas).map(item => item.ref), ['ofis']);
  assert.deepEqual(workAreas([plan.areas[0]]).map(item => item.ref), ['lobi']);
});
