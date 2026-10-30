// Facility plan geometry shared by the editor and the simulation runner.
// Coordinates are plan units on a 2000 x 2000 grid per floor; the API uses
// the same. Areas are polygons ([[x, y], ...]); a door joins two areas of one
// floor, or one area and the outside.
import { isSimple, polygonArea } from './polygon.js';

export const PLAN_SIZE = 2000;
export const GRID = 20;
export const MAX_AREAS = 60;
export const MAX_FLOORS = 10;
export const MAX_POINTS = 40;
// A door dropped this close to an area border snaps onto it.
export const SNAP_DISTANCE = 40;
export const AREA_TYPES = ['Lobi', 'Ofis', 'Yemekhane', 'Mola', 'Merdiven/Asansör', 'Üretim', 'Depo', 'Soyunma', 'Diğer'];
export const VERTICAL = 'Merdiven/Asansör';
export const AREA_COLORS = {
  Lobi: { fill: '#e0f2fe', stroke: '#0284c7' },
  Ofis: { fill: '#e0e7ff', stroke: '#4f46e5' },
  Yemekhane: { fill: '#fef3c7', stroke: '#d97706' },
  Mola: { fill: '#d1fae5', stroke: '#059669' },
  'Merdiven/Asansör': { fill: '#ede9fe', stroke: '#7c3aed' },
  Üretim: { fill: '#ffedd5', stroke: '#ea580c' },
  Depo: { fill: '#e7e5e4', stroke: '#57534e' },
  Soyunma: { fill: '#fce7f3', stroke: '#db2777' },
  Diğer: { fill: '#f1f5f9', stroke: '#64748b' },
};
export const ONE_WAY = ['Çift', 'A→B', 'B→A'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const snap = value => Math.round(value / GRID) * GRID;
const UNPLACED = { placed: false, x: null, y: null, a: null, b: null };

export const bounds = points => {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const DEFAULT_FLOOR = { id: null, ref: 'zemin', kat_adi: 'Zemin Kat', sira: 0 };

export function fromServer({ katlar = [], bolgeler = [], kapilar = [] }) {
  const refOf = id => (id == null ? null : `b${id}`);
  const areas = bolgeler.map(area => ({
    id: area.ID, ref: refOf(area.ID), name: area.Bolge_Adi, type: area.Bolge_Turu, floor: `k${area.Kat_ID}`,
    group: area.Dikey_Grup || '', points: area.Noktalar,
  }));
  const floorOf = ref => areas.find(area => area.ref === ref)?.floor ?? null;
  return {
    // A plan always has a floor to draw on; an unsaved one is sent with the first save.
    floors: katlar.length ? katlar.map(floor => ({ id: floor.ID, ref: `k${floor.ID}`, kat_adi: floor.Kat_Adi, sira: floor.Sira })) : [DEFAULT_FLOOR],
    areas,
    doors: kapilar.map(door => ({
      id: door.ID, name: door.Kapi_Adi, type: door.Kapi_Turu || 'İç Geçiş', active: door.Durum !== false,
      permitted: door.Yetkili_Sayisi ?? 0, placed: door.Plan_X != null, oneWay: door.Yon_Kisiti || 'Çift',
      x: door.Plan_X, y: door.Plan_Y, a: refOf(door.Bolge_A_ID), b: refOf(door.Bolge_B_ID),
      floor: floorOf(refOf(door.Bolge_A_ID)) ?? floorOf(refOf(door.Bolge_B_ID)),
    })),
  };
}

export function toServer({ floors, areas, doors }) {
  return {
    katlar: floors.map(floor => ({ ...(floor.id ? { id: floor.id } : {}), ref: floor.ref, kat_adi: floor.kat_adi.trim(), sira: floor.sira })),
    bolgeler: areas.map(area => ({
      ...(area.id ? { id: area.id } : {}), ref: area.ref, kat: area.floor, bolge_adi: area.name.trim(), bolge_turu: area.type,
      noktalar: area.points, dikey_grup: area.type === VERTICAL ? area.group.trim() || null : null,
    })),
    kapilar: doors.filter(door => door.placed).map(door => ({ id: door.id, plan_x: door.x, plan_y: door.y, bolge_a: door.a, bolge_b: door.b, yon_kisiti: door.oneWay })),
  };
}

export const floorsInOrder = floors => [...floors].sort((p, q) => p.sira - q.sira);
export const areasOn = (areas, floor) => areas.filter(area => area.floor === floor);
const edgesOf = points => points.map((point, i) => [point, points[(i + 1) % points.length]]);

// Closest point on segment a-b, with its position t (0..1) along it.
function project([ax, ay], [bx, by], { x, y }) {
  const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
  const t = length ? clamp(((x - ax) * dx + (y - ay) * dy) / (length * length), 0, 1) : 0;
  return { x: ax + dx * t, y: ay + dy * t, t, length };
}
const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= 1;
// Door spots are whole units, so a spot on a slanted edge is up to half a unit off.
const onBorder = (area, point) => edgesOf(area.points).some(([a, b]) => near(project(a, b, point), point));
const isCorner = (area, point) => area.points.some(([x, y]) => near({ x, y }, point));

// The areas a door at this point connects. One area means the other side is
// the outside; none means the door is not on any border. Areas are one floor's.
export function linkAt(areas, point) {
  const touching = areas.filter(area => onBorder(area, point) && !isCorner(area, point));
  if (!touching.length || touching.length > 2) return null;
  return touching.length === 1 ? { a: null, b: touching[0].ref } : { a: touching[0].ref, b: touching[1].ref };
}

// Snaps a dropped door onto the closest border, on the grid where the edge
// is straight, and at least one grid step away from the corners.
export function placeDoor(areas, point) {
  let best = null;
  for (const area of areas) {
    for (const [a, b] of edgesOf(area.points)) {
      const spot = project(a, b, point);
      const distance = Math.hypot(spot.x - point.x, spot.y - point.y);
      if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) best = { a, b, spot, distance };
    }
  }
  if (!best) return null;
  const { a, b, spot } = best;
  let at;
  if (spot.length < 2 * GRID) at = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
  else if (a[1] === b[1]) at = { x: clamp(snap(spot.x), Math.min(a[0], b[0]) + GRID, Math.max(a[0], b[0]) - GRID), y: a[1] };
  else if (a[0] === b[0]) at = { x: a[0], y: clamp(snap(spot.y), Math.min(a[1], b[1]) + GRID, Math.max(a[1], b[1]) - GRID) };
  else {
    const t = clamp(spot.t, GRID / spot.length, 1 - GRID / spot.length);
    at = { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
  }
  at = { x: Math.round(at.x), y: Math.round(at.y) };
  const link = linkAt(areas, at);
  return link && { ...at, ...link };
}

// Re-derives every placed door's connection after areas change.
export function relink(areas, doors) {
  return doors.map(door => {
    if (!door.placed) return door;
    const link = linkAt(areasOn(areas, door.floor), door) || { a: null, b: null };
    // The same two areas keep their sides: a one-way door must not flip.
    const same = (link.a === door.a && link.b === door.b) || (link.a && link.a === door.b && link.b === door.a);
    return same ? door : { ...door, ...link };
  });
}

// Replaces one area. When it moves as a whole, doors that lead from it to the
// outside move along; doors shared with another area stay and are re-linked.
export function replaceArea(plan, next) {
  const previous = plan.areas.find(area => area.ref === next.ref);
  const [dx, dy] = [next.points[0][0] - previous.points[0][0], next.points[0][1] - previous.points[0][1]];
  const moved = (dx || dy) && previous.points.length === next.points.length
    && next.points.every(([x, y], i) => x - previous.points[i][0] === dx && y - previous.points[i][1] === dy);
  const areas = plan.areas.map(area => area.ref === next.ref ? next : area);
  const doors = !moved ? plan.doors : plan.doors.map(door => door.placed && !door.a && door.b === next.ref
    ? { ...door, x: door.x + dx, y: door.y + dy } : door);
  return { ...plan, areas, doors: relink(areas, doors) };
}

export const isLinked = door => !door.placed || !!(door.a || door.b);

export function moveArea(area, dx, dy) {
  const box = bounds(area.points);
  const mx = clamp(snap(dx), -box.x, PLAN_SIZE - box.x - box.w), my = clamp(snap(dy), -box.y, PLAN_SIZE - box.y - box.h);
  return { ...area, points: area.points.map(([x, y]) => [x + mx, y + my]) };
}

const gridPoint = ({ x, y }) => [clamp(snap(x), 0, PLAN_SIZE), clamp(snap(y), 0, PLAN_SIZE)];

export function moveVertex(area, index, point) {
  return { ...area, points: area.points.map((current, i) => i === index ? gridPoint(point) : current) };
}

// Adds a corner in the middle of the edge after `index`; null when the edge is too short.
export function insertVertex(area, index) {
  if (area.points.length >= MAX_POINTS) return null;
  const [a, b] = edgesOf(area.points)[index];
  const middle = gridPoint({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 });
  if (area.points.some(([x, y]) => x === middle[0] && y === middle[1])) return null;
  return { ...area, points: [...area.points.slice(0, index + 1), middle, ...area.points.slice(index + 1)] };
}

export function removeVertex(area, index) {
  return area.points.length <= 3 ? area : { ...area, points: area.points.filter((_, i) => i !== index) };
}

// The midpoint of every edge, where a new corner can be added.
export const midpoints = area => edgesOf(area.points).map(([a, b]) => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }));

export const snapPoint = gridPoint;

// What the server would reject, or null.
export function areaProblem(area) {
  if (area.points.length < 3) return 'Bölge en az 3 noktadan oluşur.';
  if (area.points.length > MAX_POINTS) return `Bölge en fazla ${MAX_POINTS} noktadan oluşur.`;
  if (!isSimple(area.points)) return 'Bölge sınırı kendini kesiyor.';
  if (polygonArea(area.points) < 1600) return 'Bölge en az 40×40 alan kaplamalı.';
  return null;
}

// A new rectangle to the right of the floor's drawing, or below it once the row is full.
export function newArea(areas, ref, floor) {
  const w = 200, h = 160;
  const boxes = areas.map(area => bounds(area.points));
  const right = Math.max(0, ...boxes.map(box => box.x + box.w));
  const bottom = Math.max(0, ...boxes.map(box => box.y + box.h));
  const nextToRight = right + 40 + w <= 1200;
  const x = snap(nextToRight ? right + 40 : 40), y = snap(nextToRight ? 40 : Math.min(bottom + 40, PLAN_SIZE - h));
  return { id: null, ref, floor, name: `Bölge ${areas.length + 1}`, type: 'Diğer', group: '', points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
}

// The label sits inside the corner nearest to the top left.
export function labelAt(area) {
  const [x, y] = area.points.reduce((best, point) => point[0] + point[1] < best[0] + best[1] ? point : best);
  return { x: x + 10, y: y + 24 };
}

export function areaName(areas, ref) {
  return ref ? areas.find(area => area.ref === ref)?.name || '?' : 'Dış';
}

// Drawing bounds with a margin, so small plans are not drawn tiny.
export function viewBox(areas, doors) {
  const points = [...areas.flatMap(area => area.points), ...doors.filter(door => door.placed).map(door => [door.x, door.y])];
  const xs = [1000, ...points.map(point => point[0])], ys = [600, ...points.map(point => point[1])];
  return { width: Math.min(PLAN_SIZE, Math.max(...xs) + 60), height: Math.min(PLAN_SIZE, Math.max(...ys) + 60) };
}

// Same rule as gks_backend/utils/passageMeaning.js; null is the outside.
export function passageMeaning(from, to) {
  if (from === null) return 'Ana Giriş';
  if (to === null) return 'Ana Çıkış';
  if (to === 'Yemekhane') return 'Yemekhane Giriş';
  if (from === 'Yemekhane') return 'Yemekhane Çıkış';
  if (to === 'Mola') return 'Mola / Sigara Alanı';
  return 'İç Geçiş';
}

// Both ways through a placed door: who goes where, what attendance reads, and whether it is closed.
export function passages(areas, door) {
  const typeOf = ref => (ref ? areas.find(area => area.ref === ref)?.type ?? null : null);
  return [['A→B', door.a, door.b], ['B→A', door.b, door.a]].map(([way, from, to]) => ({
    way, label: `${areaName(areas, from)} → ${areaName(areas, to)}`, meaning: passageMeaning(typeOf(from), typeOf(to)),
    closed: door.oneWay !== 'Çift' && door.oneWay !== way,
  }));
}

// Stairs and lifts of the same group on other floors.
export const partners = (areas, area) => area.type === VERTICAL && area.group.trim()
  ? areas.filter(other => other.ref !== area.ref && other.type === VERTICAL && other.group.trim() === area.group.trim()) : [];

export function addFloor(plan, ref) {
  const sira = Math.max(-1, ...plan.floors.map(floor => floor.sira)) + 1;
  return { ...plan, floors: [...plan.floors, { id: null, ref, kat_adi: `${plan.floors.length}. Kat`, sira }] };
}

// Swaps a floor with its neighbour in the order (delta -1 or 1).
export function moveFloor(plan, ref, delta) {
  const ordered = floorsInOrder(plan.floors);
  const i = ordered.findIndex(floor => floor.ref === ref), other = ordered[i + delta];
  if (i < 0 || !other) return plan;
  const sira = { [ref]: other.sira, [other.ref]: ordered[i].sira };
  return { ...plan, floors: plan.floors.map(floor => floor.ref in sira ? { ...floor, sira: sira[floor.ref] } : floor) };
}

// Drops a floor with its areas; its doors leave the plan. The last floor stays.
export function removeFloor(plan, ref) {
  if (plan.floors.length <= 1) return plan;
  const gone = new Set(plan.areas.filter(area => area.floor === ref).map(area => area.ref));
  return {
    ...plan,
    floors: plan.floors.filter(floor => floor.ref !== ref),
    areas: plan.areas.filter(area => area.floor !== ref),
    doors: plan.doors.map(door => door.placed && (door.floor === ref || gone.has(door.a) || gone.has(door.b)) ? { ...door, ...UNPLACED } : door),
  };
}

export const unplace = door => ({ ...door, ...UNPLACED });
