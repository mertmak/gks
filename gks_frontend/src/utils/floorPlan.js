// Floor plan geometry shared by the editor (and later the simulation runner).
// Coordinates are plan units on a 2000 x 2000 grid; the API uses the same.
export const PLAN_SIZE = 2000;
export const GRID = 20;
export const MIN_AREA = 40;
export const MAX_AREAS = 30;
// A door dropped this close to an area border snaps onto it.
export const SNAP_DISTANCE = 40;
export const AREA_TYPES = ['Lobi', 'Ofis', 'Yemekhane', 'Mola', 'Diğer'];
export const AREA_COLORS = {
  Lobi: { fill: '#e0f2fe', stroke: '#0284c7' },
  Ofis: { fill: '#e0e7ff', stroke: '#4f46e5' },
  Yemekhane: { fill: '#fef3c7', stroke: '#d97706' },
  Mola: { fill: '#d1fae5', stroke: '#059669' },
  Diğer: { fill: '#f1f5f9', stroke: '#64748b' },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const snap = value => Math.round(value / GRID) * GRID;

export function fromServer({ bolgeler = [], kapilar = [] }) {
  const refOf = id => (id == null ? null : `b${id}`);
  return {
    areas: bolgeler.map(area => ({
      id: area.ID, ref: refOf(area.ID), name: area.Bolge_Adi, type: area.Bolge_Turu,
      x: area.X, y: area.Y, w: area.Genislik, h: area.Yukseklik,
    })),
    doors: kapilar.map(door => ({
      id: door.ID, name: door.Kapi_Adi, type: door.Kapi_Turu || 'İç Geçiş', active: door.Durum !== false,
      permitted: door.Yetkili_Sayisi ?? 0, placed: door.Plan_X != null,
      x: door.Plan_X, y: door.Plan_Y, a: refOf(door.Bolge_A_ID), b: refOf(door.Bolge_B_ID),
    })),
  };
}

export function toServer({ areas, doors }) {
  return {
    bolgeler: areas.map(area => ({
      ...(area.id ? { id: area.id } : {}), ref: area.ref, bolge_adi: area.name.trim(), bolge_turu: area.type,
      x: area.x, y: area.y, genislik: area.w, yukseklik: area.h,
    })),
    kapilar: doors.filter(door => door.placed).map(door => ({ id: door.id, plan_x: door.x, plan_y: door.y, bolge_a: door.a, bolge_b: door.b })),
  };
}

// Nearest point on the rectangle's outline.
function nearestOnBorder(area, point) {
  const x = clamp(point.x, area.x, area.x + area.w);
  const y = clamp(point.y, area.y, area.y + area.h);
  const inside = x === point.x && y === point.y;
  if (!inside) return { x, y };
  const edges = [
    [point.x - area.x, { x: area.x, y }], [area.x + area.w - point.x, { x: area.x + area.w, y }],
    [point.y - area.y, { x, y: area.y }], [area.y + area.h - point.y, { x, y: area.y + area.h }],
  ];
  return edges.sort((p, q) => p[0] - q[0])[0][1];
}

const onBorder = (area, point) => {
  const withinX = point.x >= area.x && point.x <= area.x + area.w;
  const withinY = point.y >= area.y && point.y <= area.y + area.h;
  return (withinY && (point.x === area.x || point.x === area.x + area.w))
    || (withinX && (point.y === area.y || point.y === area.y + area.h));
};
const isCorner = (area, point) => (point.x === area.x || point.x === area.x + area.w) && (point.y === area.y || point.y === area.y + area.h);

// The areas a door at this point connects. One area means the other side is
// the outside; none means the door is not on any border.
export function linkAt(areas, point) {
  const touching = areas.filter(area => onBorder(area, point) && !isCorner(area, point));
  if (!touching.length || touching.length > 2) return null;
  return touching.length === 1 ? { a: null, b: touching[0].ref } : { a: touching[0].ref, b: touching[1].ref };
}

// Snaps a dropped door onto the closest border, on the grid.
export function placeDoor(areas, point) {
  let best = null;
  for (const area of areas) {
    const candidate = nearestOnBorder(area, point);
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) best = { area, distance, point: candidate };
  }
  if (!best) return null;
  const { area } = best;
  const vertical = best.point.x === area.x || best.point.x === area.x + area.w;
  const spot = vertical
    ? { x: best.point.x, y: clamp(snap(best.point.y), area.y + GRID, area.y + area.h - GRID) }
    : { x: clamp(snap(best.point.x), area.x + GRID, area.x + area.w - GRID), y: best.point.y };
  const link = linkAt(areas, spot);
  return link && { ...spot, ...link };
}

// Re-derives every placed door's connection after areas change.
export function relink(areas, doors) {
  return doors.map(door => {
    if (!door.placed) return door;
    const link = linkAt(areas, door) || { a: null, b: null };
    return link.a === door.a && link.b === door.b ? door : { ...door, ...link };
  });
}

// Replaces one area. When it moves, doors that lead from it to the outside
// move along; doors shared with another area stay and are re-linked.
export function replaceArea(plan, next) {
  const previous = plan.areas.find(area => area.ref === next.ref);
  const dx = next.x - previous.x, dy = next.y - previous.y;
  const areas = plan.areas.map(area => area.ref === next.ref ? next : area);
  const doors = !dx && !dy ? plan.doors : plan.doors.map(door => door.placed && !door.a && door.b === next.ref
    ? { ...door, x: door.x + dx, y: door.y + dy } : door);
  return { areas, doors: relink(areas, doors) };
}

export const isLinked = door => !door.placed || !!(door.a || door.b);

export function moveArea(area, dx, dy) {
  return { ...area, x: clamp(snap(area.x + dx), 0, PLAN_SIZE - area.w), y: clamp(snap(area.y + dy), 0, PLAN_SIZE - area.h) };
}

export function resizeArea(area, dw, dh) {
  return { ...area, w: clamp(snap(area.w + dw), MIN_AREA, PLAN_SIZE - area.x), h: clamp(snap(area.h + dh), MIN_AREA, PLAN_SIZE - area.y) };
}

// A new area to the right of the drawing, or below it once the row is full.
export function newArea(areas, ref) {
  const w = 200, h = 160;
  const right = Math.max(0, ...areas.map(area => area.x + area.w));
  const bottom = Math.max(0, ...areas.map(area => area.y + area.h));
  const nextToRight = right + 40 + w <= 1200;
  const x = nextToRight ? right + 40 : 40;
  const y = nextToRight ? 40 : Math.min(bottom + 40, PLAN_SIZE - h);
  return { id: null, ref, name: `Bölge ${areas.length + 1}`, type: 'Diğer', x: snap(x), y: snap(y), w, h };
}

export function areaName(areas, ref) {
  return ref ? areas.find(area => area.ref === ref)?.name || '?' : 'Dış';
}

// Drawing bounds with a margin, so small plans are not drawn tiny.
export function viewBox(areas, doors) {
  const xs = [1000, ...areas.map(area => area.x + area.w), ...doors.filter(door => door.placed).map(door => door.x)];
  const ys = [600, ...areas.map(area => area.y + area.h), ...doors.filter(door => door.placed).map(door => door.y)];
  return { width: Math.min(PLAN_SIZE, Math.max(...xs) + 60), height: Math.min(PLAN_SIZE, Math.max(...ys) + 60) };
}
