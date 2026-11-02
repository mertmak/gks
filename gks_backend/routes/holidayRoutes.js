const router = require('express').Router();
const { sql } = require('../db');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { inTransaction, httpError, validateId } = require('../utils/transaction');
const { addSystemLog } = require('../utils/logger');
const { isUniqueViolation } = require('../utils/dbErrors');
const socket = require('../utils/socket');
router.param('id', validateId);
const notify = () => { socket.getIO().emit('holidays_updated'); socket.getIO().emit('new_system_log'); };

router.get('/holidays', verifyToken, async (req, res, next) => {
    try { res.json((await sql.query('SELECT ID,Tarih,Tatil_Adi FROM Resmi_Tatiller ORDER BY Tarih DESC')).recordset); }
    catch (error) { next(error); }
});
router.post('/holidays', verifyToken, verifyAdmin, validate(schemas.resmiTatilSchema), async (req, res, next) => {
    const { tarih, tatil_adi } = req.body;
    try {
        await inTransaction(async tx => {
            await new sql.Request(tx).input('tarih', sql.Date, tarih).input('ad', sql.NVarChar, tatil_adi)
                .query('INSERT INTO Resmi_Tatiller(Tarih,Tatil_Adi) VALUES(@tarih,@ad)');
            await addSystemLog(req.user.kullanici_adi, 'RESMİ TATİL', tatil_adi, '', `${tarih} eklendi.`, tx);
        });
        notify();
        res.json({ success: true, message: 'Resmi tatil eklendi.' });
    } catch (error) { next(isUniqueViolation(error) ? httpError(409, 'Bu tarihte zaten bir resmi tatil var.') : error); }
});
router.delete('/holidays/:id', verifyToken, verifyAdmin, async (req, res, next) => {
    try {
        await inTransaction(async tx => {
            const deleted = (await new sql.Request(tx).input('id', sql.Int, req.params.id)
                .query('DELETE FROM Resmi_Tatiller WHERE ID=@id RETURNING Tarih,Tatil_Adi')).recordset[0];
            if (!deleted) throw httpError(404, 'Resmi tatil bulunamadı.');
            await addSystemLog(req.user.kullanici_adi, 'RESMİ TATİL', deleted.Tatil_Adi, '', `${deleted.Tarih.toISOString().slice(0, 10)} silindi.`, tx);
        });
        notify();
        res.json({ success: true, message: 'Resmi tatil silindi.' });
    } catch (error) { next(error); }
});
module.exports = router;
