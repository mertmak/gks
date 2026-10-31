const router = require('express').Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { validateQuery, simPlanQuery, simDayQuery } = require('../middlewares/query');
const { inTransaction } = require('../utils/transaction');
const { allowed } = require('../config/simulation');
const socket = require('../utils/socket');
const simulation = require('../services/doorSimulation');

const guard = (req, res, next) => allowed(req) ? next() : res.status(403).json({ success: false, message: 'Simülasyon yalnızca ayrı test veritabanında çalışır.' });
// The browser sends reads in batches; one limit per personal copy.
const readLimit = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => req.user.sandbox || ipKeyGenerator(req.ip),
    message: { success: false, message: 'Çok fazla okutma isteği. Simülasyonu yavaşlatıp tekrar deneyin.' } });

router.get('/simulasyon/plan', verifyToken, verifyAdmin, guard, validateQuery(simPlanQuery), async (req, res, next) => {
    const { tarih, gec, devamsiz } = req.validatedQuery;
    try { res.json(await simulation.dayPlan(tarih, { late: gec, absent: devamsiz })); }
    catch (error) { next(error); }
});

router.delete('/simulasyon/gun', verifyToken, verifyAdmin, guard, validateQuery(simDayQuery), async (req, res, next) => {
    try {
        const silinen = await inTransaction(tx => simulation.clearDay(tx, req.validatedQuery.tarih));
        socket.getIO().emit('new_rfid_log');
        res.json({ success: true, silinen });
    } catch (error) { next(error); }
});

router.post('/simulasyon/okutma', verifyToken, verifyAdmin, guard, readLimit, validate(schemas.simReadSchema), async (req, res, next) => {
    try {
        const sonuclar = await inTransaction(tx => simulation.recordReads(tx, req.body.okutmalar));
        socket.getIO().emit('new_rfid_log');
        res.json({ success: true, sonuclar });
    } catch (error) { next(error); }
});

module.exports = router;
