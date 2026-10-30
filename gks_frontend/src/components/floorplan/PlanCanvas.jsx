import { useRef, useState } from 'react';
import { AREA_COLORS, GRID, areaProblem, insertVertex, labelAt, midpoints, moveArea, moveVertex, placeDoor, removeVertex, snapPoint, viewBox } from '../../utils/floorPlan';

const SELECT = '#0891b2';
const INVALID = '#dc2626';

// SVG drawing of one floor. Tools: 'select' drags areas, corners and doors;
// 'draw' adds corners by clicking (closed on the first corner, by double
// click or Enter; Esc cancels); 'door' picks a border spot. The parent owns
// the data and re-links doors whenever an area changes.
export default function PlanCanvas({ areas, doors, selected, editable, tool = 'select', placing, onSelect, onAreaChange, onDoorMove, onPlace, onInvalidPlace, onDraw, onCancel, children }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const [draft, setDraft] = useState([]);
  const [cursor, setCursor] = useState(null);
  const { width, height } = viewBox(areas, doors);
  if (tool !== 'draw' && draft.length) setDraft([]);
  const picking = !!placing || tool === 'door';
  const selecting = editable && tool === 'select' && !placing;

  const toPlan = event => {
    const point = svg.current.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const { x, y } = point.matrixTransform(svg.current.getScreenCTM().inverse());
    return { x, y };
  };
  const start = (event, value) => {
    if (!selecting) return;
    event.stopPropagation();
    svg.current.setPointerCapture(event.pointerId);
    drag.current = { ...value, from: toPlan(event) };
  };
  const move = event => {
    if (tool === 'draw' && editable) { const [x, y] = snapPoint(toPlan(event)); setCursor({ x, y }); }
    const current = drag.current;
    if (!current) return;
    const point = toPlan(event);
    if (current.kind === 'move') onAreaChange(moveArea(current.area, point.x - current.from.x, point.y - current.from.y));
    else if (current.kind === 'vertex') onAreaChange(moveVertex(current.area, current.index, point));
    else {
      const spot = placeDoor(areas, point);
      if (spot) onDoorMove(current.id, spot);
    }
  };
  const end = () => { drag.current = null; };
  const finish = () => {
    if (draft.length >= 3) onDraw(draft);
    setDraft([]);
  };
  // Pointer capture retargets the click after a drag, so clearing the
  // selection happens on pointerdown on the empty background instead.
  const clear = event => { if (tool === 'select' && !placing && event.target === svg.current) onSelect(null); };
  const click = event => {
    if (!editable) return;
    if (picking) {
      const spot = placeDoor(areas, toPlan(event));
      if (spot) onPlace(spot); else onInvalidPlace();
      return;
    }
    if (tool !== 'draw') return;
    const [x, y] = snapPoint(toPlan(event));
    const first = draft[0], last = draft[draft.length - 1];
    if (draft.length >= 3 && first[0] === x && first[1] === y) finish();
    else if (!last || last[0] !== x || last[1] !== y) setDraft([...draft, [x, y]]);
  };
  const keyDown = event => {
    if (!editable) return;
    if (event.key === 'Escape') { setDraft([]); onCancel?.(); return; }
    if (tool === 'draw' && event.key === 'Enter') { event.preventDefault(); finish(); return; }
    if (selected?.kind !== 'area') return;
    const area = areas.find(item => item.ref === selected.key);
    if (!area) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.vertex != null) {
      event.preventDefault();
      onAreaChange(removeVertex(area, selected.vertex));
      onSelect({ kind: 'area', key: area.ref });
      return;
    }
    const step = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] }[event.key];
    if (!step) return;
    event.preventDefault();
    if (selected.vertex == null) onAreaChange(moveArea(area, ...step));
    else {
      const [x, y] = area.points[selected.vertex];
      onAreaChange(moveVertex(area, selected.vertex, { x: x + step[0], y: y + step[1] }));
    }
  };
  const addCorner = (event, area, index) => {
    if (!selecting) return;
    event.stopPropagation();
    const next = insertVertex(area, index);
    if (!next) return;
    onAreaChange(next);
    onSelect({ kind: 'area', key: area.ref, vertex: index + 1 });
  };

  const cursorClass = picking || tool === 'draw' ? 'cursor-crosshair' : '';
  return (
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0}
      aria-label="Kat planı. Seçili bölge veya köşe ok tuşlarıyla taşınır, seçili köşe Delete ile silinir. Çizimde Enter bölgeyi kapatır, Esc iptal eder."
      className={`w-full min-w-[640px] bg-white select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${cursorClass}`}
      onPointerDown={clear} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={click} onKeyDown={keyDown}
      onDoubleClick={() => { if (tool === 'draw') finish(); }}>
      <defs>
        <pattern id="plan-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#plan-grid)" pointerEvents="none" />
      {areas.map(area => {
        const color = AREA_COLORS[area.type] || AREA_COLORS.Diğer;
        const active = selected?.kind === 'area' && selected.key === area.ref;
        const invalid = !!areaProblem(area);
        const label = labelAt(area);
        return (
          <g key={area.ref}>
            <polygon points={area.points.join(' ')} fill={invalid ? '#fee2e2' : color.fill} stroke={invalid ? INVALID : active ? SELECT : color.stroke}
              strokeWidth={active ? 4 : 2} strokeDasharray={invalid ? '8 4' : undefined} className={selecting ? 'cursor-move' : ''}
              onPointerDown={event => { if (tool !== 'select' || placing) return; onSelect({ kind: 'area', key: area.ref }); start(event, { kind: 'move', area }); }} />
            <text x={label.x} y={label.y} fontSize="16" fontWeight="700" fill="#0f172a" pointerEvents="none">{area.name}</text>
            <text x={label.x} y={label.y + 20} fontSize="13" fill="#475569" pointerEvents="none">{area.type}{area.group ? ` · ${area.group}` : ''}</text>
            {selecting && active && midpoints(area).map((point, i) => (
              <g key={`m${i}`} className="cursor-copy" onPointerDown={event => addCorner(event, area, i)}>
                <title>Köşe ekle</title>
                <circle cx={point.x} cy={point.y} r="7" fill="#fff" stroke={SELECT} strokeWidth="2" />
                <path d={`M ${point.x - 3.5} ${point.y} h 7 M ${point.x} ${point.y - 3.5} v 7`} stroke={SELECT} strokeWidth="2" pointerEvents="none" />
              </g>
            ))}
            {selecting && active && area.points.map(([x, y], i) => (
              <rect key={`v${i}`} x={x - 7} y={y - 7} width="14" height="14" fill={selected.vertex === i ? SELECT : '#fff'} stroke={SELECT} strokeWidth="2"
                className="cursor-grab" onPointerDown={event => { onSelect({ kind: 'area', key: area.ref, vertex: i }); start(event, { kind: 'vertex', area, index: i }); }} />
            ))}
          </g>
        );
      })}
      {doors.filter(door => door.placed).map(door => {
        const active = selected?.kind === 'door' && selected.key === door.id;
        const fill = !(door.a || door.b) ? INVALID : door.active ? '#0f172a' : '#94a3b8';
        return (
          <g key={door.id} className={selecting ? 'cursor-grab' : ''}
            onPointerDown={event => { if (tool !== 'select' || placing) return; onSelect({ kind: 'door', key: door.id }); start(event, { kind: 'door', id: door.id }); }}>
            {active && <circle cx={door.x} cy={door.y} r="17" fill="none" stroke={SELECT} strokeWidth="4" />}
            <circle cx={door.x} cy={door.y} r="11" fill={fill} stroke="#fff" strokeWidth="3" strokeDasharray={door.active ? undefined : '4 3'} />
            {door.oneWay !== 'Çift' && <text x={door.x} y={door.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" pointerEvents="none">1</text>}
            <text x={door.x + 15} y={door.y - 12} fontSize="12" fontWeight="600" fill="#334155" stroke="#fff" strokeWidth="3" paintOrder="stroke">{door.name}</text>
          </g>
        );
      })}
      {draft.length > 0 && <g pointerEvents="none">
        <polyline points={[...draft, ...(cursor ? [[cursor.x, cursor.y]] : [])].join(' ')} fill="none" stroke={SELECT} strokeWidth="3" strokeDasharray="6 4" />
        {draft.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 0 ? 8 : 5} fill={i === 0 ? '#fff' : SELECT} stroke={SELECT} strokeWidth="2" />)}
      </g>}
      {children}
    </svg>
  );
}
