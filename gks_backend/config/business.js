// One startup setting for the API and browser's current business day.
const timeZone = process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul';
let formatter, clock;
try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
} catch {
    throw new Error('BUSINESS_TIMEZONE geçerli bir IANA saat dilimi olmalıdır.');
}
module.exports = Object.freeze({ timeZone, date: (value = new Date()) => formatter.format(value), time: (value = new Date()) => clock.format(value) });
