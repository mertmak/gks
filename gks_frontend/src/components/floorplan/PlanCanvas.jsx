import { useRef } from 'react';
import { AREA_COLORS, GRID, moveArea, resizeArea, placeDoor, viewBox } from '../../utils/floorPlan';

// SVG drawing of the plan. Dragging moves areas and doors; the parent owns the
// data and re-links doors whenever an area changes.
export default function PlanCanvas({ areas, doors, selected, editable, placing, onSelect, onAreaChange, onDoorMove, onPlace, onInvalidPlace }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const { width, height } = viewBox(areas, doors);

  const toPlan = event => {
    const point = svg.current.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const { x, y } = point.matrixTransform(svg.current.getScreenCTM().inverse());
    return { x, y };
  };
  const start = (event, value) => {
    if (!editable || placing) return;
    event.stopPropagation();
    svg.current.setPointerCapture(event.pointerId);
    drag.current = { ...value, from: toPlan(event) };
  };
  const move = event => {
    const current = drag.current;
    if (!current) return;
    const point = toPlan(event);
    const dx = point.x - current.from.x, dy = point.y - current.from.y;
    if (current.kind === 'move') onAreaChange(moveArea(current.area, dx, dy));
    else if (current.kind === 'resize') onAreaChange(resizeArea(current.area, dx, dy));
    else {
      const spot = placeDoor(areas, point);
      if (spot) onDoorMove(current.id, spot);
    }
  };
  const end = () => { drag.current = null; };
  // Pointer capture retargets the click after a drag, so clearing the
  // selection happens on pointerdown on the empty background instead.
  const clear = event => { if (!placing && event.target === svg.current) onSelect(null); };
  const click = event => {
    if (!placing) return;
    const spot = placeDoor(areas, toPlan(event));
    if (spot) onPlace(placing, spot); else onInvalidPlace();
  };
  const keyDown = event => {
    if (!editable || selected?.kind !== 'area') return;
    const area = areas.find(item => item.ref === selected.key);
    const step = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] }[event.key];
    if (!area || !step) return;
    event.preventDefault();
    onAreaChange(event.shiftKey ? resizeArea(area, ...step) : moveArea(area, ...step));
  };

  return (
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label="Kat planı. Seçili bölge ok tuşlarıyla taşınır, Shift ile boyutlandırılır."
      className={`w-full min-w-[640px] bg-white select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${placing ? 'cursor-crosshair' : ''}`}
      onPointerDown={clear} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={click} onKeyDown={keyDown}>
      <defs>
        <pattern id="plan-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#plan-grid)" pointerEvents="none" />
      {areas.map(area => {
        const color = AREA_COLORS[area.type] || AREA_COLORS.Diğer;
        const active = selected?.kind === 'area' && selected.key === area.ref;
        return (
          <g key={area.ref}>
            <rect x={area.x} y={area.y} width={area.w} height={area.h} fill={color.fill} stroke={active ? '#0891b2' : color.stroke}
              strokeWidth={active ? 4 : 2} className={editable && !placing ? 'cursor-move' : ''}
              onPointerDown={event => { onSelect({ kind: 'area', key: area.ref }); start(event, { kind: 'move', area }); }} />
            <text x={area.x + 10} y={area.y + 24} fontSize="16" fontWeight="700" fill="#0f172a" pointerEvents="none">{area.name}</text>
            <text x={area.x + 10} y={area.y + 44} fontSize="13" fill="#475569" pointerEvents="none">{area.type}</text>
            {editable && active && <rect x={area.x + area.w - 14} y={area.y + area.h - 14} width="14" height="14" fill="#0891b2"
              className="cursor-se-resize" onPointerDown={event => start(event, { kind: 'resize', area })} />}
          </g>
        );
      })}
      {doors.filter(door => door.placed).map(door => {
        const active = selected?.kind === 'door' && selected.key === door.id;
        const fill = !(door.a || door.b) ? '#dc2626' : door.active ? '#0f172a' : '#94a3b8';
        return (
          <g key={door.id} className={editable && !placing ? 'cursor-grab' : ''}
            onPointerDown={event => { onSelect({ kind: 'door', key: door.id }); start(event, { kind: 'door', id: door.id }); }}>
            {active && <circle cx={door.x} cy={door.y} r="17" fill="none" stroke="#0891b2" strokeWidth="4" />}
            <circle cx={door.x} cy={door.y} r="11" fill={fill} stroke="#fff" strokeWidth="3" strokeDasharray={door.active ? undefined : '4 3'} />
            <text x={door.x + 15} y={door.y - 12} fontSize="12" fontWeight="600" fill="#334155" stroke="#fff" strokeWidth="3" paintOrder="stroke">{door.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
