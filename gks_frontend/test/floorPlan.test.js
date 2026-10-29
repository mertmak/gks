import test from 'node:test';
import assert from 'node:assert/strict';
import { fromServer, toServer, linkAt, placeDoor, relink, replaceArea, moveArea, resizeArea, newArea, isLinked } from '../src/utils/floorPlan.js';

const lobby = { ref: 'lobi', x: 40, y: 200, w: 200, h: 240 };
const office = { ref: 'ofis', x: 240, y: 40, w: 480, h: 400 };
const areas = [lobby, office];

test('a door on a shared border joins both areas; an outer border leads outside', () => {
  assert.deepEqual(linkAt(areas, { x: 240, y: 300 }), { a: 'lobi', b: 'ofis' });
  assert.deepEqual(linkAt(areas, { x: 40, y: 300 }), { a: null, b: 'lobi' });
  assert.equal(linkAt(areas, { x: 100, y: 300 }), null, 'inside an area');
  assert.equal(linkAt(areas, { x: 40, y: 200 }), null, 'corners are not doors');
});

test('dropped doors snap onto the nearest border on the grid', () => {
  assert.deepEqual(placeDoor(areas, { x: 228, y: 311 }), { x: 240, y: 320, a: 'lobi', b: 'ofis' });
  assert.deepEqual(placeDoor(areas, { x: 15, y: 300 }), { x: 40, y: 300, a: null, b: 'lobi' });
  // Not into a corner: the point is kept one grid step inside the edge.
  assert.deepEqual(placeDoor(areas, { x: 30, y: 195 }), { x: 40, y: 220, a: null, b: 'lobi' });
  assert.equal(placeDoor(areas, { x: 1500, y: 1500 }), null);
});

test('moving an area re-links the doors on its border', () => {
  const doors = [{ id: 1, placed: true, x: 240, y: 300, a: 'lobi', b: 'ofis' }, { id: 2, placed: false }];
  const moved = [moveArea(lobby, -20, 0), office];
  const linked = relink(moved, doors);
  assert.deepEqual([linked[0].a, linked[0].b], [null, 'ofis']);
  assert.equal(linked[1], doors[1]);
  const away = relink([moveArea(lobby, 0, 600), moveArea(office, 600, 0)], doors);
  assert.equal(isLinked(away[0]), false);
});

test('areas stay on the grid, inside the plan and at least 40 units wide', () => {
  assert.deepEqual(moveArea(lobby, 7, -500), { ...lobby, x: 40, y: 0 });
  assert.deepEqual(moveArea(lobby, 5000, 0).x, 1800);
  assert.deepEqual(resizeArea(lobby, -500, 13), { ...lobby, w: 40, h: 260 });
  const added = newArea(areas, 'n1');
  assert.deepEqual([added.x, added.y, added.ref], [760, 40, 'n1']);
  assert.deepEqual([newArea([], 'n2').x, newArea([], 'n2').y], [40, 40]);
});

test('server rows round-trip through the editor model', () => {
  const server = {
    bolgeler: [{ ID: 7, Bolge_Adi: 'Lobi', Bolge_Turu: 'Lobi', X: 40, Y: 200, Genislik: 200, Yukseklik: 240 }],
    kapilar: [
      { ID: 1, Kapi_Adi: 'Giriş', Kapi_Turu: 'Ana Giriş', Durum: true, Plan_X: 40, Plan_Y: 300, Bolge_A_ID: null, Bolge_B_ID: 7, Yetkili_Sayisi: 3 },
      { ID: 2, Kapi_Adi: 'Depo', Kapi_Turu: null, Durum: false, Plan_X: null, Plan_Y: null, Bolge_A_ID: null, Bolge_B_ID: null },
    ],
  };
  const model = fromServer(server);
  assert.equal(model.doors[1].type, 'İç Geçiş');
  assert.equal(model.doors[1].active, false);
  model.areas.push({ id: null, ref: 'n1', name: ' Ofis ', type: 'Ofis', x: 240, y: 200, w: 200, h: 200 });
  assert.deepEqual(toServer(model), {
    bolgeler: [
      { id: 7, ref: 'b7', bolge_adi: 'Lobi', bolge_turu: 'Lobi', x: 40, y: 200, genislik: 200, yukseklik: 240 },
      { ref: 'n1', bolge_adi: 'Ofis', bolge_turu: 'Ofis', x: 240, y: 200, genislik: 200, yukseklik: 200 },
    ],
    kapilar: [{ id: 1, plan_x: 40, plan_y: 300, bolge_a: null, bolge_b: 'b7' }],
  });
});

test('outer doors move with their area; shared doors stay on the other area', () => {
  const doors = [{ id: 1, placed: true, x: 40, y: 300, a: null, b: 'lobi' }, { id: 2, placed: true, x: 240, y: 300, a: 'lobi', b: 'ofis' }];
  const next = replaceArea({ areas, doors }, moveArea(lobby, -20, 40));
  assert.deepEqual(next.doors[0], { ...doors[0], x: 20, y: 340 });
  assert.deepEqual([next.doors[1].x, next.doors[1].a, next.doors[1].b], [240, null, 'ofis']);
  const resized = replaceArea({ areas, doors }, resizeArea(lobby, 0, 40));
  assert.equal(resized.doors[0], doors[0]);
});
