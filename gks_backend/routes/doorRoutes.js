const router = require('express').Router();
const { sql } = require('../db');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { inTransaction, httpError, validateId } = require('../utils/transaction');
const { addDoorLog } = require('../utils/logger');
const socket = require('../utils/socket');
router.param('id', validateId);
router.get('/doors', verifyToken, async (req, res, next) => {
    try { res.json((await sql.query('SELECT * FROM Doors ORDER BY ID')).recordset); }
    catch (error) { next(error); }
});

function changeDoor(kind) {
    return async (req, res, next) => {
        try {
            await inTransaction(async tx => {
                const request = new sql.Request(tx).input('id', sql.Int, req.params.id || null);
                let current;
                if (kind !== 'create') {
                    current = (await request.query('SELECT * FROM Doors WHERE ID=@id FOR UPDATE')).recordset[0];
                    if (!current) throw httpError(404, 'Kapı bulunamadı.');
                }
                if (kind === 'status') {
                    request.input('durum', sql.Bit, req.body.durum);
                    await request.query('DELETE FROM Permissions WHERE Door_ID=@id AND NOT @durum');
                    await request.query('UPDATE Doors SET Durum=@durum WHERE ID=@id');
                } else {
                    request.input('ad', sql.NVarChar, req.body.kapi_adi).input('tur', sql.NVarChar, req.body.kapi_turu)
                        .input('departman', sql.NVarChar, req.body.departman).input('konum', sql.NVarChar, req.body.konum);
                    await request.query(kind === 'create'
                        ? 'INSERT INTO Doors(Kapi_Adi,Kapi_Turu,Departman,Konum,Durum) VALUES(@ad,@tur,@departman,@konum,true)'
                        : 'UPDATE Doors SET Kapi_Adi=@ad,Kapi_Turu=@tur,Departman=@departman,Konum=@konum WHERE ID=@id');
                }
                await addDoorLog(req.user.kullanici_adi, kind === 'create' ? 'YENİ KAPI' : 'KAPI GÜNCELLENDİ', req.body.kapi_adi || current.Kapi_Adi,
                    kind === 'status' ? `Durum: ${req.body.durum}. Pasife almada yetkiler kaldırılır.` : `Kapı türü: ${req.body.kapi_turu}`, tx);
            });
            for (const event of ['doors_updated', 'system_updated', 'new_door_log']) socket.getIO().emit(event);
            res.json({ success: true, message: 'Kapı kaydedildi.' });
        } catch (error) { next(error); }
    };
}
router.post('/doors', verifyToken, verifyAdmin, validate(schemas.kapiEkleSchema), changeDoor('create'));
router.put('/doors/:id', verifyToken, verifyAdmin, validate(schemas.kapiEkleSchema), changeDoor('update'));
router.patch('/doors/:id/status', verifyToken, verifyAdmin, validate(schemas.kapiDurumSchema), changeDoor('status'));
module.exports = router;
