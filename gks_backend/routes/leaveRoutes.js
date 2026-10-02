const express = require('express');
const router = express.Router();
const { sql } = require('../db');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { addSystemLog } = require('../utils/logger');
const logger = require('../utils/appLogger');
const { inTransaction, httpError, validateId } = require('../utils/transaction');
router.param('id', validateId);

// 1. TÜM İZİNLERİ GETİR
router.get('/leaves', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT I.ID, I.User_ID, U.Ad_Soyad, U.Sicil_No, U.Departman, 
                   I.Izin_Turu, I.Baslangic_Tarihi, I.Bitis_Tarihi, I.Aciklama, I.Durum,
                   CAST(CASE WHEN I.Durum IN (N'Onaylandı',N'Bekliyor') AND EXISTS (
                     SELECT 1 FROM Izinler OtherLeave WHERE OtherLeave.User_ID=I.User_ID AND OtherLeave.ID<>I.ID
                       AND OtherLeave.Durum IN (N'Onaylandı',N'Bekliyor')
                       AND OtherLeave.Baslangic_Tarihi<=I.Bitis_Tarihi AND OtherLeave.Bitis_Tarihi>=I.Baslangic_Tarihi
                   ) THEN 1 ELSE 0 END AS bit) AS Cakisma_Var
            FROM Izinler I
            JOIN Users U ON I.User_ID = U.ID
            ORDER BY I.Baslangic_Tarihi DESC
        `;
        const result = await sql.query(query);
        res.json(result.recordset);
    } catch (err) {
        logger.error('İzinleri çekme hatası: ' + err.message);
        res.status(500).json({ success: false, message: 'İzinler getirilemedi.' });
    }
});

// Approved and pending leaves reserve inclusive calendar days; rejected leaves do not.
router.post('/leaves', verifyToken, verifyAdmin, validate(schemas.izinEkleSchema), async (req, res, next) => {
    const { user_id, izin_turu, baslangic, bitis, aciklama, durum } = req.body;
    try {
        await inTransaction(async tx => {
            const request = new sql.Request(tx).input('uid', sql.Int, user_id)
                .input('tur', sql.NVarChar, izin_turu).input('bas', sql.Date, baslangic)
                .input('bit', sql.Date, bitis).input('aciklama', sql.NVarChar, aciklama)
                .input('durum', sql.NVarChar, durum);
            const user = (await request.query('SELECT Ad_Soyad,Sicil_No FROM Users WITH (UPDLOCK,HOLDLOCK) WHERE ID=@uid')).recordset[0];
            if (!user) throw httpError(404, 'Personel bulunamadı.');
            if (durum !== 'Reddedildi') {
                const overlap = await request.query("SELECT ID FROM Izinler WITH (UPDLOCK,HOLDLOCK) WHERE User_ID=@uid AND Durum IN (N'Onaylandı',N'Bekliyor') AND Baslangic_Tarihi<=@bit AND Bitis_Tarihi>=@bas");
                if (overlap.recordset.length) throw httpError(409, 'Bu tarih aralığında onaylı veya bekleyen izin var. Önce mevcut kaydı kaldırın.');
            }
            await request.query('INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi,Aciklama,Durum) VALUES(@uid,@tur,@bas,@bit,@aciklama,@durum)');
            await addSystemLog(req.user.kullanici_adi, 'İZİN GİRİŞİ', user.Ad_Soyad, user.Sicil_No, `${baslangic} - ${bitis}: ${izin_turu} (${durum})`, tx);
        });
        notifyLeaves();
        res.json({ success: true, message: 'İzin başarıyla sisteme eklendi.' });
    } catch (error) { next(error); }
});

router.delete('/leaves/:id', verifyToken, verifyAdmin, async (req, res, next) => {
    try {
        const info = (await new sql.Request().input('id', sql.Int, req.params.id).query('SELECT User_ID FROM Izinler WHERE ID=@id')).recordset[0];
        if (!info) throw httpError(404, 'İzin kaydı bulunamadı.');
        await inTransaction(async tx => {
            const request = new sql.Request(tx).input('id', sql.Int, req.params.id);
            request.input('uid', sql.Int, info.User_ID);
            const user = (await request.query('SELECT Ad_Soyad,Sicil_No FROM Users WITH (UPDLOCK,HOLDLOCK) WHERE ID=@uid')).recordset[0];
            const deleted = await request.query('DELETE FROM Izinler OUTPUT DELETED.Izin_Turu WHERE ID=@id');
            if (!deleted.recordset.length) throw httpError(404, 'İzin kaydı bulunamadı.');
            await addSystemLog(req.user.kullanici_adi, 'İZİN İPTALİ', user.Ad_Soyad, user.Sicil_No, `${deleted.recordset[0].Izin_Turu} kaydı silindi.`, tx);
        });
        notifyLeaves();
        res.json({ success: true, message: 'İzin kaydı başarıyla silindi.' });
    } catch (error) { next(error); }
});

function notifyLeaves() {
    const io = require('../utils/socket').getIO();
    io.emit('leaves_updated');
    io.emit('new_system_log');
}
module.exports = router;
