// Labor Law 4857 art. 53: 14 days for years 1–5, 20 for years 6–14, 26 from year 15.
// Periods with the same employer are added up; leave is earned on each completed service year.
const dayMs = 86400000;
const tier = year => year <= 5 ? 14 : year < 15 ? 20 : 26;
const addYears = (ms, years) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()); };
const key = ms => new Date(ms).toISOString().slice(0, 10);

// periods: [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null }], inclusive; open periods run to `today`.
// With `since` (a carry-over date) Hak_Edilen counts only anniversaries on or after it.
function annualLeaveEntitlement(periods, today, since = null) {
    const t = Date.parse(today);
    let days = 0;
    for (const p of periods) {
        const s = Date.parse(p.start), e = Math.min(p.end ? Date.parse(p.end) : t, t);
        if (e >= s) days += (e - s) / dayMs + 1;
    }
    if (!days) return { Kidem_Gun: 0, Kidem_Yil: 0, Hak_Edilen: 0, Sonraki_Hak_Tarihi: null, Sonraki_Hak_Gun: tier(1) };
    // Service start as if all periods were continuous and ended today.
    const start = t - (days - 1) * dayMs;
    let years = 0, earned = 0;
    const from = since ? Date.parse(since) : -Infinity;
    while (addYears(start, years + 1) <= t) { years++; if (addYears(start, years) >= from) earned += tier(years); }
    return { Kidem_Gun: days, Kidem_Yil: years, Hak_Edilen: earned, Sonraki_Hak_Tarihi: key(addYears(start, years + 1)), Sonraki_Hak_Gun: tier(years + 1) };
}
module.exports = { annualLeaveEntitlement };
