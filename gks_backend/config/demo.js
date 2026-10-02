// Read once at startup. Requests and JWT claims cannot change deployment mode.
const enabled = process.env.DEMO_MODE === 'true';
const referenceDate = '2026-09-07';
const accountName = process.env.DEMO_USERNAME || 'gks-demo';
module.exports = Object.freeze({ enabled, referenceDate, accountName });
