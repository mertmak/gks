import { floorsInOrder } from '../../utils/floorPlan';

// Floor switcher, top floor first like a lift panel. `count` may add a number per floor.
export default function FloorTabs({ floors, current, onSelect, count }) {
  return (
    <div role="group" aria-label="Kat" className="flex flex-wrap gap-1">
      {floorsInOrder(floors).reverse().map(floor => {
        const number = count?.(floor.ref);
        return <button key={floor.ref} type="button" aria-pressed={floor.ref === current} onClick={() => onSelect(floor.ref)}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${floor.ref === current ? 'bg-primary text-white border-primary' : 'bg-surface text-ink border-line-strong'}`}>
          {floor.kat_adi.trim() || 'Adsız kat'}{number != null && <span className="ml-1.5 tabular-nums opacity-80">({number})</span>}
        </button>;
      })}
    </div>
  );
}
