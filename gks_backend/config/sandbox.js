// Read once at startup. Personal simulation copies exist only on the public demo.
const demo = require('./demo');
const bounded = (value, fallback, min, max) => {
    const number = Number(value ?? fallback);
    return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const enabled = demo.enabled && process.env.SANDBOX_MODE === 'true';
const ttlMinutes = bounded(process.env.SANDBOX_TTL_MIN, 120, 10, 720);
const maxActive = bounded(process.env.SANDBOX_MAX, 30, 1, 200);
const visitorName = 'Simülasyon Ziyaretçisi';
module.exports = Object.freeze({ enabled, ttlMinutes, maxActive, visitorName });
