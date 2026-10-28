const jwt = require('jsonwebtoken');
const { enabled } = require('../config/demo');
const sandbox = require('../config/sandbox');
// A signed sandbox token may write; verifyToken then checks that the copy is
// still active and confines every query to its schema.
const sandboxToken = req => {
    try { return !!jwt.verify(req.headers.authorization?.split(' ')[1], process.env.JWT_SECRET).sandbox; } catch { return false; }
};
module.exports = (req, res, next) => {
    if (!enabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.method === 'POST' && ['/login', '/demo-login'].includes(req.path)) return next();
    if (sandbox.enabled && (req.method === 'POST' && req.path === '/sandbox' || sandboxToken(req))) return next();
    return res.status(403).json({ success: false, code: 'DEMO_READ_ONLY', message: 'Bu demo salt okunurdur. Değişiklikler yalnız local kurulumda kullanılabilir.' });
};
