const { inTransaction, httpError } = require('../utils/transaction');
const { addSystemLog } = require('../utils/logger');
const notifyAudit = () => require('../utils/socket').getIO().emit('new_system_log');
const express = require('express');
const router = express.Router();
router.param('id', require('../utils/transaction').validateId);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { sql } = require('../db');
const { verifyToken, verifyAdmin, SECRET_KEY } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const logger = require('../utils/appLogger');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 10,
    skipSuccessfulRequests: true,                   // Aynı IP'den en fazla 10 deneme
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.' }
});

router.post('/login', loginLimiter, validate(schemas.loginSchema), async (req, res) => {
    const { username, password } = req.body;
    try {
        const request = new sql.Request();
        request.input('kullanici', sql.VarChar, username);
        const result = await request.query('SELECT * FROM Yoneticiler WHERE Kullanici_Adi = @kullanici');

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            const isMatch = await bcrypt.compare(password, user.Sifre_Hash);
            
            if (isMatch) {
                const token = jwt.sign(
                    { role: user.Rol, id: user.ID, kullanici_adi: user.Kullanici_Adi, version: user.Token_Version },
                    SECRET_KEY, 
                    { expiresIn: '8h' }
                );
                res.json({ success: true, token: token });
            } else {
                res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı.' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı.' });
        }
    } catch (err) {
        logger.error('Login hatası: ' + err.message);
        res.status(500).json({ success: false, message: 'Sunucu hatası!' });
    }
});

router.post('/ilk-kurulum', (req,res,next) => process.env.NODE_ENV !== 'production' && process.env.ENABLE_SETUP === 'true' ? next() : res.status(404).json({success:false,message:'Kurulum kapalı.'}), loginLimiter, validate(schemas.ilkKurulumSchema), async (req, res) => {
    try {
        const { username, password } = req.body;
        const hash = await bcrypt.hash(password, 12);
        await inTransaction(async tx => {
            const request = new sql.Request(tx);
            const existing = await request.query('SELECT COUNT(*) AS count FROM Yoneticiler WITH (UPDLOCK,HOLDLOCK)');
            if (existing.recordset[0].count) throw Object.assign(new Error('Sistem zaten kurulu.'), { statusCode: 403 });
            await request.input('user', sql.VarChar, username).input('hash', sql.VarChar, hash)
                .query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES(@user,@hash,'admin')");
            await addSystemLog(username, 'İLK KURULUM', username, '', 'İlk yönetici hesabı oluşturuldu.', tx);
        });
        notifyAudit();
        res.json({ success: true, message: 'İlk yönetici hesabı oluşturuldu.' });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Kurulum tamamlanamadı.' });
    }
});

router.post('/hesap-ekle', verifyToken, verifyAdmin, validate(schemas.hesapEkleSchema), async (req, res, next) => {
    const { username, password, rol } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        await inTransaction(async tx => {
            await new sql.Request(tx).input('name', sql.VarChar, username).input('hash', sql.VarChar, hash)
                .input('role', sql.VarChar, rol).query('INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES(@name,@hash,@role)');
            await addSystemLog(req.user.kullanici_adi, 'HESAP OLUŞTURMA', username, '', `Rol: ${rol}`, tx);
        });
        notifyAudit();
        res.json({ success: true, message: 'Yeni hesap oluşturuldu.' });
    } catch (error) {
        if ([2601, 2627].includes(error.number)) return res.status(400).json({ success: false, message: 'Bu kullanıcı adı zaten mevcut.' });
        next(error);
    }
});

router.post('/sifre-degistir', verifyToken, validate(schemas.sifreDegistirSchema), async (req, res, next) => {
    try {
        const user = (await new sql.Request().input('id', sql.Int, req.user.id)
            .query('SELECT ID,Kullanici_Adi,Sifre_Hash,Token_Version FROM Yoneticiler WHERE ID=@id')).recordset[0];
        if (!user || !await bcrypt.compare(req.body.eskiSifre, user.Sifre_Hash)) throw httpError(401, 'Mevcut şifrenizi yanlış girdiniz.');
        const hash = await bcrypt.hash(req.body.yeniSifre, 10);
        await inTransaction(async tx => {
            const updated = await new sql.Request(tx).input('id', sql.Int, user.ID)
                .input('version', sql.Int, user.Token_Version).input('hash', sql.VarChar, hash)
                .query('UPDATE Yoneticiler SET Sifre_Hash=@hash,Token_Version=Token_Version+1 WHERE ID=@id AND Token_Version=@version');
            if (!updated.rowsAffected[0]) throw httpError(401, 'Oturum değişti. Yeniden giriş yapınız.');
            await addSystemLog(user.Kullanici_Adi, 'PAROLA DEĞİŞİKLİĞİ', user.Kullanici_Adi, '', 'Parola değiştirildi; eski oturumlar geçersiz kılındı.', tx);
        });
        notifyAudit();
        res.json({ success: true, message: 'Şifreniz başarıyla güncellendi!' });
    } catch (error) { next(error); }
});

router.get('/hesaplar', verifyToken, verifyAdmin, async (req, res) => {
    // Hesapları çekme kodlarınız...
        try {
        const result = await sql.query('SELECT ID, Kullanici_Adi, Rol, Olusturulma_Tarihi FROM Yoneticiler ORDER BY ID DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Hesaplar çekilirken hata oluştu.' });
    }
});

router.delete('/hesap-sil/:id', verifyToken, verifyAdmin, async (req, res, next) => {
    if (req.user.id == req.params.id) return res.status(403).json({ success: false, message: 'Kendi hesabınızı silemezsiniz!' });
    try {
        await inTransaction(async tx => {
            const deleted = await new sql.Request(tx).input('id', sql.Int, req.params.id)
                .query('DELETE FROM Yoneticiler OUTPUT DELETED.Kullanici_Adi,DELETED.Rol WHERE ID=@id');
            if (!deleted.recordset.length) throw httpError(404, 'Hesap bulunamadı.');
            const user = deleted.recordset[0];
            await addSystemLog(req.user.kullanici_adi, 'HESAP SİLME', user.Kullanici_Adi, '', `Hesap ID: ${req.params.id}, rol: ${user.Rol}`, tx);
        });
        notifyAudit();
        res.json({ success: true, message: 'Hesap başarıyla sistemden silindi!' });
    } catch (error) { next(error); }
});

module.exports = router;