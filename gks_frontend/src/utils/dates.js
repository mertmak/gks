import { demoSettings } from './demo.js';
// SQL DATETIME values in this project are business wall-clock timestamps.
export const businessDate = (value) => !value && demoSettings().demo ? demoSettings().referenceDate : new Intl.DateTimeFormat('en-CA', {
  timeZone: demoSettings().businessTimeZone || 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value || new Date());

// Calendar-only arithmetic must not depend on the visitor's local timezone.
export function shiftDateDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function previousMonthDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}
