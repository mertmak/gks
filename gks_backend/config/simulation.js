// Simulations write synthetic data: only into a visitor's personal copy or a
// separate local review/test database, never into the demo or production.
const allowed = req => !!req.user?.sandbox || (!require('./demo').enabled && process.env.NODE_ENV !== 'production'
    && /^(GksReview_|GksTest_)/i.test(process.env.DB_NAME || ''));
module.exports = { allowed };
