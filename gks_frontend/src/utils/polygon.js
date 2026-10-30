// Same rules as gks_backend/utils/polygon.js, so the editor shows what the
// server would reject. Polygons are [[x, y], ...], implicitly closed.
export const polygonArea = points => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nx, ny] = points[(i + 1) % points.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const within = (p, q, r) => Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
function intersects(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (!o1 && within(a, c, b)) || (!o2 && within(a, d, b)) || (!o3 && within(c, a, d)) || (!o4 && within(c, b, d));
}
const foldsBack = (p, shared, q) => !orient(p, shared, q) && (within(p, q, shared) || within(shared, p, q));

export function isSimple(points) {
  const n = points.length;
  if (n < 3 || new Set(points.map(point => point.join(','))).size !== n) return false;
  const at = i => points[(i + n) % n];
  for (let i = 0; i < n; i++) {
    if (foldsBack(at(i - 1), at(i), at(i + 1))) return false;
    for (let j = i + 2; j < n - (i === 0 ? 1 : 0); j++) {
      if (intersects(at(i), at(i + 1), at(j), at(j + 1))) return false;
    }
  }
  return true;
}

// Ray casting; points on the border count as inside or outside arbitrarily.
export function contains(points, [x, y]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
