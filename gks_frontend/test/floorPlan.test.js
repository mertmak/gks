import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fromServer, toServer, linkAt, placeDoor, relink, replaceArea, moveArea, moveVertex, insertVertex, removeVertex, newArea, isLinked,
  areaProblem, passages, partners, addFloor, moveFloor, removeFloor, floorsInOrder,
} from '../src/utils/floorPlan.js';
import { isSimple, contains } from '../src/utils/polygon.js';

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const lobby = { ref: 'lobi', floor: 'z', type: 'Lobi', name: 'Lobi', group: '', points: rect(40, 200, 200, 240) };
const office = { ref: 'ofis', floor: 'z', type: 'Ofis', name: 'Ofis', group: '', points: rect(240, 40, 480, 400) };
// An L shape with a slanted edge from (840, 240) to (740, 340).
const hall = { ref: 'hol', floor: 'z', type: 'Üretim', name: 'Hol', group: '', points: [[640, 40], [840, 40], [840, 240], [740, 340], [740, 600], [640, 600]] };
const areas = [lobby, office];

test('a door on a shared border joins both areas; an outer border leads outside', () => {
  assert.deepEqual(linkAt(areas, { x: 240, y: 300 }), { a: 'lobi', b: 'ofis' });
  assert.deepEqual(linkAt(areas, { x: 40, y: 300 }), { a: null, b: 'lobi' });
  assert.equal(linkAt(areas, { x: 100, y: 300 }), null, 'inside an area');
  assert.equal(linkAt(areas, { x: 40, y: 200 }), null, 'corners are not doors');
});

test('dropped doors snap onto the nearest edge, on the grid where it is straight', () => {
  assert.deepEqual(placeDoor(areas, { x: 228, y: 311 }), { x: 240, y: 320, a: 'lobi', b: 'ofis' });
  assert.deepEqual(placeDoor(areas, { x: 15, y: 300 }), { x: 40, y: 300, a: null, b: 'lobi' });
  // Not into a corner: the point is kept one grid step inside the edge.
  assert.deepEqual(placeDoor(areas, { x: 30, y: 195 }), { x: 60, y: 200, a: null, b: 'lobi' });
  assert.equal(placeDoor(areas, { x: 1500, y: 1500 }), null);
  // A slanted edge: the door sits on the line itself, in whole units.
  const slanted = placeDoor([hall], { x: 815, y: 295 });
  assert.deepEqual(slanted, { x: 800, y: 280, a: null, b: 'hol' });
  assert.deepEqual(linkAt([hall], slanted), { a: null, b: 'hol' });
});

test('changing areas re-links the doors on their borders, per floor', () => {
  const doors = [{ id: 1, placed: true, floor: 'z', x: 240, y: 300, a: 'lobi', b: 'ofis' }, { id: 2, placed: false }];
  const moved = [moveArea(lobby, -20, 0), office];
  const linked = relink(moved, doors);
  assert.deepEqual([linked[0].a, linked[0].b], [null, 'ofis']);
  assert.equal(linked[1], doors[1]);
  assert.equal(isLinked(relink([moveArea(lobby, 0, 600), moveArea(office, 600, 0)], doors)[0]), false);
  // The same pair in the other order keeps the door's sides.
  const reversed = { ...doors[0], a: 'ofis', b: 'lobi' };
  assert.equal(relink([lobby, office], [reversed])[0], reversed);
  // An area on another floor at the same spot does not touch the door.
  const upstairs = { ...lobby, ref: 'ust', floor: 'u' };
  assert.deepEqual(relink([upstairs, office], doors)[0], { ...doors[0], a: null, b: 'ofis' });
});

test('areas move on the grid inside the plan; corners are dragged, added and removed', () => {
  assert.deepEqual(moveArea(lobby, 7, -500).points, rect(40, 0, 200, 240));
  assert.deepEqual(moveArea(lobby, 5000, 0).points[1], [2000, 200]);
  const dragged = moveVertex(lobby, 2, { x: 287, y: 451 });
  assert.deepEqual(dragged.points[2], [280, 460]);
  const added = insertVertex(lobby, 0);
  assert.deepEqual(added.points, [[40, 200], [140, 200], [240, 200], [240, 440], [40, 440]]);
  assert.equal(insertVertex({ ...lobby, points: [[0, 0], [20, 0], [20, 40]] }, 0), null, 'too short for a new corner');
  assert.deepEqual(removeVertex(added, 1).points, lobby.points);
  assert.equal(removeVertex({ ...lobby, points: lobby.points.slice(0, 3) }, 0).points.length, 3);
  const fresh = newArea(areas, 'n1', 'z');
  assert.deepEqual([fresh.points[0], fresh.ref, fresh.floor], [[760, 40], 'n1', 'z']);
  assert.deepEqual(newArea([], 'n2', 'z').points[0], [40, 40]);
});

test('the editor flags what the server rejects', () => {
  assert.equal(areaProblem(hall), null);
  assert.match(areaProblem({ points: [[0, 0], [200, 200], [200, 0], [0, 200]] }), /kendini kesiyor/);
  assert.match(areaProblem({ points: rect(0, 0, 20, 40) }), /40×40/);
  assert.match(areaProblem({ points: Array.from({ length: 41 }, (_, i) => [Math.round(1000 + 500 * Math.cos(i / 41 * 2 * Math.PI)), Math.round(1000 + 500 * Math.sin(i / 41 * 2 * Math.PI))]) }), /en fazla 40/);
  assert.equal(isSimple(hall.points), true);
  assert.equal(contains(hall.points, [700, 500]), true);
  assert.equal(contains(hall.points, [800, 400]), false, 'outside the slanted edge');
});

test('server rows round-trip through the editor model', () => {
  const server = {
    katlar: [{ ID: 3, Kat_Adi: 'Zemin Kat', Sira: 0 }, { ID: 4, Kat_Adi: '1. Kat', Sira: 1 }],
    bolgeler: [
      { ID: 7, Kat_ID: 3, Bolge_Adi: 'Lobi', Bolge_Turu: 'Lobi', Noktalar: rect(40, 200, 200, 240), Dikey_Grup: null },
      { ID: 8, Kat_ID: 4, Bolge_Adi: 'Merdiven', Bolge_Turu: 'Merdiven/Asansör', Noktalar: rect(240, 40, 100, 100), Dikey_Grup: 'M' },
    ],
    kapilar: [
      { ID: 1, Kapi_Adi: 'Giriş', Kapi_Turu: 'Ana Giriş', Durum: true, Plan_X: 40, Plan_Y: 300, Bolge_A_ID: null, Bolge_B_ID: 7, Yon_Kisiti: 'A→B', Yetkili_Sayisi: 3 },
      { ID: 2, Kapi_Adi: 'Depo', Kapi_Turu: null, Durum: false, Plan_X: null, Plan_Y: null, Bolge_A_ID: null, Bolge_B_ID: null },
    ],
  };
  const model = fromServer(server);
  assert.deepEqual([model.doors[0].floor, model.doors[1].type, model.doors[1].active], ['k3', 'İç Geçiş', false]);
  assert.equal(model.areas[1].group, 'M');
  model.areas.push({ id: null, ref: 'n1', floor: 'k4', name: ' Ofis ', type: 'Ofis', group: 'yok sayılır', points: rect(400, 40, 200, 200) });
  assert.deepEqual(toServer(model), {
    katlar: [{ id: 3, ref: 'k3', kat_adi: 'Zemin Kat', sira: 0 }, { id: 4, ref: 'k4', kat_adi: '1. Kat', sira: 1 }],
    bolgeler: [
      { id: 7, ref: 'b7', kat: 'k3', bolge_adi: 'Lobi', bolge_turu: 'Lobi', noktalar: server.bolgeler[0].Noktalar, dikey_grup: null },
      { id: 8, ref: 'b8', kat: 'k4', bolge_adi: 'Merdiven', bolge_turu: 'Merdiven/Asansör', noktalar: server.bolgeler[1].Noktalar, dikey_grup: 'M' },
      { ref: 'n1', kat: 'k4', bolge_adi: 'Ofis', bolge_turu: 'Ofis', noktalar: rect(400, 40, 200, 200), dikey_grup: null },
    ],
    kapilar: [{ id: 1, plan_x: 40, plan_y: 300, bolge_a: null, bolge_b: 'b7', yon_kisiti: 'A→B' }],
  });
  // An empty plan still has a floor to draw on.
  assert.deepEqual(fromServer({ katlar: [], bolgeler: [], kapilar: [] }).floors, [{ id: null, ref: 'zemin', kat_adi: 'Zemin Kat', sira: 0 }]);
});

test('outer doors move with their area; shared doors stay on the other area', () => {
  const doors = [{ id: 1, placed: true, floor: 'z', x: 40, y: 300, a: null, b: 'lobi' }, { id: 2, placed: true, floor: 'z', x: 240, y: 300, a: 'lobi', b: 'ofis' }];
  const next = replaceArea({ areas, doors }, moveArea(lobby, -20, 40));
  assert.deepEqual(next.doors[0], { ...doors[0], x: 20, y: 340 });
  assert.deepEqual([next.doors[1].x, next.doors[1].a, next.doors[1].b], [240, null, 'ofis']);
  // Dragging one corner is not a move: the outer door stays where it was.
  const reshaped = replaceArea({ areas, doors }, moveVertex(lobby, 2, { x: 240, y: 480 }));
  assert.equal(reshaped.doors[0], doors[0]);
});

test('each way through a door has its meaning and may be closed', () => {
  const door = { a: null, b: 'lobi', oneWay: 'A→B' };
  assert.deepEqual(passages(areas, door), [
    { way: 'A→B', label: 'Dış → Lobi', meaning: 'Ana Giriş', closed: false },
    { way: 'B→A', label: 'Lobi → Dış', meaning: 'Ana Çıkış', closed: true },
  ]);
});

test('floors are added, reordered and removed with their areas and doors', () => {
  const stairs = (ref, floor) => ({ ref, floor, type: 'Merdiven/Asansör', name: ref, group: 'M', points: rect(0, 0, 100, 100) });
  let plan = { floors: [{ ref: 'z', kat_adi: 'Zemin Kat', sira: 0 }], areas: [lobby, stairs('m0', 'z')], doors: [{ id: 1, placed: true, floor: 'z', x: 40, y: 300, a: null, b: 'lobi' }] };
  plan = addFloor(plan, 'u');
  assert.deepEqual(plan.floors[1], { id: null, ref: 'u', kat_adi: '1. Kat', sira: 1 });
  plan = { ...plan, areas: [...plan.areas, stairs('m1', 'u')] };
  assert.deepEqual(partners(plan.areas, plan.areas[1]).map(area => area.ref), ['m1']);
  assert.deepEqual(partners(plan.areas, lobby), []);
  assert.deepEqual(floorsInOrder(moveFloor(plan, 'u', -1).floors).map(floor => floor.ref), ['u', 'z']);
  assert.equal(moveFloor(plan, 'u', 1), plan, 'already last');
  const removed = removeFloor(plan, 'z');
  assert.deepEqual([removed.floors.map(floor => floor.ref), removed.areas.map(area => area.ref), removed.doors[0].placed], [['u'], ['m1'], false]);
  assert.equal(removeFloor(removed, 'u'), removed, 'the last floor stays');
});
