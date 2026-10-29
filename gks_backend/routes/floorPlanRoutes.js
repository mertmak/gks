const router = require('express').Router();
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { inTransaction } = require('../utils/transaction');
const socket = require('../utils/socket');
const floorPlan = require('../services/floorPlan');

const emitChanged = () => {
    for (const event of ['floorplan_updated', 'doors_updated', 'new_door_log']) socket.getIO().emit(event);
};

router.get('/kat-plani', verifyToken, async (req, res, next) => {
    try { res.json(await floorPlan.readPlan()); }
    catch (error) { next(error); }
});

router.put('/kat-plani', verifyToken, verifyAdmin, validate(schemas.floorPlanSchema), async (req, res, next) => {
    try {
        await inTransaction(tx => floorPlan.updatePlan(tx, req.body, req.user.kullanici_adi));
        emitChanged();
        res.json({ success: true, message: 'Kat planı kaydedildi.' });
    } catch (error) { next(error); }
});

router.post('/kat-plani/sablon', verifyToken, verifyAdmin, async (req, res, next) => {
    try {
        const result = await inTransaction(tx => floorPlan.applyTemplate(tx, req.user.kullanici_adi));
        emitChanged();
        socket.getIO().emit('system_updated');
        res.json({ success: true, message: `Ofis şablonu uygulandı: ${result.placed} kapı yerleştirildi, ${result.created} kapı eklendi.`, ...result });
    } catch (error) { next(error); }
});

module.exports = router;
