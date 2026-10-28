const router = require('express').Router();
const demo = require('../config/demo');
const sandbox = require('../config/sandbox');
const business = require('../config/business');
const { sql } = require('../db');
const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('../middlewares/auth');
router.get('/public-config', (req, res) => res.json({ demo: demo.enabled, referenceDate: demo.enabled ? demo.referenceDate : null, businessTimeZone: business.timeZone, sandbox: sandbox.enabled, sandboxMinutes: sandbox.enabled ? sandbox.ttlMinutes : null }));
router.post('/demo-login', require('express-rate-limit').rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Çok fazla demo giriş isteği. Bir dakika sonra tekrar deneyin.' } }), async (req, res, next) => {
    if (!demo.enabled) return res.status(404).json({ success: false, message: 'Demo girişi kapalı.' });
    try {
        const account = (await new sql.Request().input('name', sql.VarChar, demo.accountName)
            .query("SELECT ID,Rol,Kullanici_Adi,Token_Version FROM Yoneticiler WHERE gks_ci(Kullanici_Adi)=gks_ci(@name) AND Rol='user'")).recordset[0];
        if (!account) return res.status(503).json({ success: false, message: 'Demo henüz hazır değil.' });
        const token = jwt.sign({ id: account.ID, role: 'user', kullanici_adi: account.Kullanici_Adi, version: account.Token_Version, demo: true }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ success: true, token });
    } catch (error) { next(error); }
});
module.exports = router;
