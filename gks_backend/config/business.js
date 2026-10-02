// One startup setting for the API and browser's current business day.
const timeZone = process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul';
let formatter;
try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
} catch {
    throw new Error('BUSINESS_TIMEZONE geçerli bir IANA saat dilimi olmalıdır.');
}
module.exports = Object.freeze({ timeZone, date: (value = new Date()) => formatter.format(value) });
