import { THEMES, THEME_LABELS, setTheme, useTheme } from '../utils/theme';

export default function ThemeSelect() {
  const { choice } = useTheme();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only sm:not-sr-only">Tema</span>
      <select value={choice} onChange={event => setTheme(event.target.value)}
        className="rounded-md border border-line bg-surface text-ink px-2 py-1.5 max-lg:min-h-11 text-sm focus:ring-2 focus:ring-accent outline-none">
        {THEMES.map(value => <option key={value} value={value}>{THEME_LABELS[value]}</option>)}
      </select>
    </label>
  );
}
