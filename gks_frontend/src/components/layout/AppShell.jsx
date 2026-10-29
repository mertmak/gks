import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import ThemeSelect from '../ThemeSelect';
import { pageTitle } from '../../utils/nav';

const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6zM21 19v-1a4 4 0 00-3-3.87M15.5 4.13a3 3 0 010 5.74',
  door: 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18M14 12h.01',
  plan: 'M3 4h18v16H3zM3 12h8m0-8v16m4-8h6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9',
  arrows: 'M7 7h13l-4-4M17 17H4l4 4',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M9 12l2 2 4-4',
  play: 'M8 5v14l11-7z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M6 18L18 6',
  collapse: 'M15 6l-6 6 6 6',
};

const Icon = ({ name, className = 'w-5 h-5' }) => (
  <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>
);

const readCollapsed = () => { try { return localStorage.getItem('gks-sidebar') === 'collapsed'; } catch { return false; } };

function NavLinks({ nav, collapsed }) {
  const { pathname } = useLocation();
  const link = (to, label, icon, nested, active = pathname === to) => {
    return (
      <Link key={to} to={to} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
        className={`relative flex items-center gap-3 rounded-md py-2 text-sm ${collapsed ? 'justify-center px-2' : nested ? 'pl-11 pr-3' : 'px-3'} ${active ? 'bg-white/10 text-white font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}>
        {active && <span className="absolute left-0 inset-y-1.5 w-[3px] rounded-full bg-[#5cc3cb]" aria-hidden="true" />}
        {icon && <Icon name={icon} />}
        <span className={collapsed ? 'sr-only' : ''}>{label}</span>
      </Link>
    );
  };
  return (
    <ul className="space-y-0.5">
      {nav.map(entry => {
        if (!entry.items) return <li key={entry.label}>{link(entry.to, entry.label, entry.icon)}</li>;
        if (!entry.items.length) return null;
        // Collapsed rail: the group icon opens the first page of the group.
        const open = entry.items.some(item => item.to === pathname);
        if (collapsed) return <li key={entry.label}>{link(entry.items[0].to, entry.label, entry.icon, false, open)}</li>;
        return (
          <li key={entry.label} className="pt-2">
            <p className={`flex items-center gap-3 px-3 py-1.5 text-sm ${open ? 'text-white' : 'text-slate-400'}`}><Icon name={entry.icon} />{entry.label}</p>
            <ul className="space-y-0.5">{entry.items.map(item => <li key={item.to}>{link(item.to, item.label, null, true)}</li>)}</ul>
          </li>
        );
      })}
    </ul>
  );
}

function AccountMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const id = useId();
  return (
    <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } }}>
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-3 max-w-[60vw]">
        <span className="truncate">{label}</span>
        <svg className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div id={id} className="absolute right-0 mt-2 w-56 bg-surface rounded-lg shadow-lg border border-line z-50 py-1 flex flex-col"
        onClick={event => { if (event.target.closest('a')) setOpen(false); }}>{children}</div>}
    </div>
  );
}

export default function AppShell({ nav, banner, account, children }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const drawerPanel = useRef(null);
  const closeDrawer = () => setDrawer(false);
  useFocusTrap(drawerPanel, drawer, closeDrawer);
  const title = pageTitle(nav, pathname);
  useEffect(() => { document.title = title ? `${title} · GKS` : 'GKS — Geçiş Kontrol Sistemi'; }, [title]);
  const toggleCollapsed = () => setCollapsed(value => {
    try { localStorage.setItem('gks-sidebar', value ? 'open' : 'collapsed'); } catch { /* Preference lasts for this page only. */ }
    return !value;
  });

  const brand = <Link to="/" className="font-bold tracking-tight text-white text-lg">GKS</Link>;

  return (
    <div className="min-h-screen bg-page text-ink lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-surface focus:text-ink focus:px-4 focus:py-2 focus:rounded-md">İçeriğe geç</a>

      <aside className={`hidden lg:flex flex-col shrink-0 bg-rail sticky top-0 h-screen ${collapsed ? 'w-[4.5rem]' : 'w-60'}`}>
        <div className={`flex items-center h-14 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && brand}
          <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'} aria-expanded={!collapsed}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5">
            <Icon name="collapse" className={`w-5 h-5 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <nav aria-label="Ana menü" className="flex-1 overflow-y-auto px-3 pb-6">
          <NavLinks nav={nav} collapsed={collapsed} />
        </nav>
      </aside>

      {drawer && <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/60" onClick={closeDrawer}>
        <div ref={drawerPanel} role="dialog" aria-modal="true" aria-label="Ana menü" tabIndex={-1}
          className="bg-rail w-72 max-w-[85vw] h-full flex flex-col" onClick={event => { event.stopPropagation(); if (event.target.closest('a')) closeDrawer(); }}>
          <div className="flex items-center justify-between h-14 px-4">
            {brand}
            <button type="button" onClick={closeDrawer} aria-label="Menüyü kapat" className="p-1.5 rounded-md text-slate-300 hover:text-white"><Icon name="close" /></button>
          </div>
          <nav aria-label="Ana menü" className="flex-1 overflow-y-auto px-3 pb-6"><NavLinks nav={nav} /></nav>
        </div>
      </div>}

      <div className="flex-1 min-w-0 flex flex-col">
        {banner}
        <header className="sticky top-0 z-40 h-14 bg-surface border-b border-line flex items-center gap-2 px-3 sm:px-4">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Menüyü aç" className="lg:hidden p-2 rounded-md text-ink hover:bg-surface-3"><Icon name="menu" /></button>
          <span className="lg:hidden font-bold">GKS</span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeSelect />
            <AccountMenu label={account.label}>{account.items}</AccountMenu>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 lg:px-8 focus:outline-none">{children}</main>
      </div>
    </div>
  );
}
