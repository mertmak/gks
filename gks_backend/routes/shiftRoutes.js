const router = require('express').Router();
const { sql } = require('../db');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { inTransaction, httpError, validateId } = require('../utils/transaction');
const { addSystemLog } = require('../utils/logger');
const socket = require('../utils/socket');
router.param('id', validateId);
router.get('/shifts', verifyToken, async (req, res, next) => {
    try { res.json((await sql.query('SELECT * FROM Vardiyalar ORDER BY ID DESC')).recordset); }
    catch (error) { next(error); }
});
function changeShift(kind) {
    return async (req, res, next) => {
        try {
            await inTransaction(async tx => {
                const request = new sql.Request(tx).input('id', sql.Int, req.params.id || null);
                let current;
                if (kind !== 'create') {
                    current = (await request.query('SELECT * FROM Vardiyalar WITH (UPDLOCK,HOLDLOCK) WHERE ID=@id')).recordset[0];
                    if (!current) throw httpError(404, 'Vardiya bulunamadı.');
                }
                const v = req.body;
                if (kind === 'status') {
                    await request.input('durum', sql.Bit, v.durum).query('UPDATE Vardiyalar SET Durum=@durum WHERE ID=@id');
                } else {
                    request.input('ad', sql.NVarChar, v.vardiya_adi).input('bas', sql.NVarChar, v.mesai_baslangic)
                        .input('bit', sql.NVarChar, v.mesai_bitis).input('ybas', sql.NVarChar, v.yemek_baslangic || null)
                        .input('ybit', sql.NVarChar, v.yemek_bitis || null).input('tol', sql.Int, v.tolerans_dk)
                        .input('mola', sql.Int, v.mola_hakki_dk).input('gunler', sql.NVarChar, v.calisma_gunleri);
                    await request.query(kind === 'create'
                        ? 'INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Yemek_Baslangic,Yemek_Bitis,Tolerans_Dk,Mola_Hakki_Dk,Calisma_Gunleri,Durum) VALUES(@ad,@bas,@bit,@ybas,@ybit,@tol,@mola,@gunler,1)'
                        : 'UPDATE Vardiyalar SET Vardiya_Adi=@ad,Mesai_Baslangic=@bas,Mesai_Bitis=@bit,Yemek_Baslangic=@ybas,Yemek_Bitis=@ybit,Tolerans_Dk=@tol,Mola_Hakki_Dk=@mola,Calisma_Gunleri=@gunler WHERE ID=@id');
                }
                await addSystemLog(req.user.kullanici_adi, 'VARDİYA', v.vardiya_adi || current.Vardiya_Adi, '',
                    kind === 'status' ? `Durum: ${v.durum}` : `${v.mesai_baslangic}–${v.mesai_bitis}, günler: ${v.calisma_gunleri}`, tx);
            });
            socket.getIO().emit('shifts_updated');socket.getIO().emit('new_system_log');
            res.json({ success: true, message: 'Vardiya kaydedildi.' });
        } catch (error) { next(error); }
    };
}
router.post('/shifts', verifyToken, verifyAdmin, validate(schemas.vardiyaSchema), changeShift('create'));
router.put('/shifts/:id', verifyToken, verifyAdmin, validate(schemas.vardiyaSchema), changeShift('update'));
router.patch('/shifts/:id/status', verifyToken, verifyAdmin, validate(schemas.vardiyaDurumSchema), changeShift('status'));
module.exports = router;
