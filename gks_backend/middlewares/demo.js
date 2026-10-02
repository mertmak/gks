const { enabled } = require('../config/demo');
module.exports = (req, res, next) => {
    if (!enabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.method === 'POST' && ['/login', '/demo-login'].includes(req.path)) return next();
    return res.status(403).json({ success: false, code: 'DEMO_READ_ONLY', message: 'Bu demo salt okunurdur. Değişiklikler yalnız local kurulumda kullanılabilir.' });
};
