// Plan polygons are [[x, y], ...] in drawing order, implicitly closed.
const area = points => Math.abs(points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
}, 0)) / 2;

const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const within = (p, q, r) => Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
// Segments touch or cross, collinear overlaps included.
function intersects(a, b, c, d) {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (!o1 && within(a, c, b)) || (!o2 && within(a, d, b)) || (!o3 && within(c, a, d)) || (!o4 && within(c, b, d));
}

// Neighbouring edges p-shared and shared-q fold back onto each other.
const foldsBack = (p, shared, q) => !orient(p, shared, q) && (within(p, q, shared) || within(shared, p, q));

// Simple polygon: no repeated point, no edge crossing or touching another
// edge, and neighbouring edges meet only at their shared corner.
function isSimple(points) {
    const n = points.length;
    if (new Set(points.map(point => point.join(','))).size !== n) return false;
    const at = i => points[(i + n) % n];
    for (let i = 0; i < n; i++) {
        if (foldsBack(at(i - 1), at(i), at(i + 1))) return false;
        // Non-neighbouring edges; the last edge neighbours the first.
        for (let j = i + 2; j < n - (i === 0 ? 1 : 0); j++) {
            if (intersects(at(i), at(i + 1), at(j), at(j + 1))) return false;
        }
    }
    return true;
}

module.exports = { area, isSimple };
