const router = require('express').Router();
const jwt = require('jsonwebtoken');
const config = require('../config/sandbox');
const sandbox = require('../services/sandbox');
const { outsideSchema } = require('../db/context');
const { verifyToken, SECRET_KEY } = require('../middlewares/auth');

// Creating a copy runs every migration; keep it scarce per visitor.
const limiter = require('express-rate-limit').rateLimit({ windowMs: 10 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Çok fazla simülasyon alanı isteği. Birkaç dakika sonra tekrar deneyin.' } });
const enabled = (req, res, next) => config.enabled ? next() : res.status(404).json({ success: false, message: 'Simülasyon alanı kapalı.' });
const sandboxOnly = (req, res, next) => req.user.sandbox ? next() : res.status(400).json({ success: false, message: 'Açık bir simülasyon alanı yok.' });

async function open(res) {
    const { schema, expiresAt } = await outsideSchema(() => sandbox.create());
    const token = jwt.sign({ sandbox: schema, role: 'admin', kullanici_adi: config.visitorName, demo: true }, SECRET_KEY, { expiresIn: config.ttlMinutes * 60 });
    res.json({ success: true, token, expiresAt });
}

router.post('/sandbox', enabled, limiter, async (req, res, next) => {
    try { await open(res); } catch (error) { next(error); }
});
router.post('/sandbox/reset', enabled, verifyToken, sandboxOnly, limiter, async (req, res, next) => {
    try {
        await outsideSchema(() => sandbox.drop(req.user.sandbox));
        await open(res);
    } catch (error) { next(error); }
});
router.delete('/sandbox', enabled, verifyToken, sandboxOnly, async (req, res, next) => {
    try {
        await outsideSchema(() => sandbox.drop(req.user.sandbox));
        res.json({ success: true, message: 'Simülasyon alanı silindi.' });
    } catch (error) { next(error); }
});
module.exports = router;
