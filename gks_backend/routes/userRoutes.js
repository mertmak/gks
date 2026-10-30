const { inTransaction, httpError } = require('../utils/transaction');
const { businessToday, dateKey } = require('../utils/attendance');
const { validateQuery, usersQuery } = require('../middlewares/query');
const { changePersonnel } = require('../services/personnelChanges');
const express = require('express');
const router = express.Router();
router.param('id', require('../utils/transaction').validateId);
const { sql } = require('../db');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');
const { validate, schemas } = require('../middlewares/validate');
const { addSystemLog } = require('../utils/logger');
const socket = require('../utils/socket');
const logger = require('../utils/appLogger');
const { isUniqueViolation } = require('../utils/dbErrors');

// Generate Unique Sistem ID Yardımcı Fonksiyonu
const generateUniqueSistemId = async () => {
    let isUnique = false;
    let newId = '';
    while (!isUnique) {
        newId = Math.floor(10000000000 + Math.random() * 90000000000).toString();
        const req = new sql.Request();
        req.input('checkId', sql.NVarChar, newId);
        const check = await req.query(`SELECT ID FROM Users WHERE Sistem_ID = @checkId`);
        if (check.recordset.length === 0) isUnique = true;
    }
    return newId;
};

// ============================================
// 1. BÖLÜM: TOPLU İŞLEMLER (Önce Çalışmalı Ki Rota Çakışması Olmasın)
// ============================================

router.post('/users/bulk/shift', verifyToken, verifyAdmin, validate(schemas.bulkShiftSchema), async (req,res,next) => {
    try {
        const count = await changePersonnel({ kind: 'shift', userId: req.params.id, target: req.body, value: req.body, actor: req.user.kullanici_adi });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: `${count} personel güncellendi.` });
    } catch(e) { next(e); }
});

router.post('/users/bulk/doors', verifyToken, verifyAdmin, validate(schemas.bulkDoorsSchema), async (req,res,next) => {
    try {
        const count = await changePersonnel({ kind: 'doors', userId: req.params.id, target: req.body, value: req.body, actor: req.user.kullanici_adi });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: `${count} personel güncellendi.` });
    } catch(e) { next(e); }
});

router.post('/users/bulk/status', verifyToken, verifyAdmin, validate(schemas.bulkStatusSchema), async (req,res,next) => {
    try {
        const count = await changePersonnel({ kind: 'status', userId: req.params.id, target: req.body, value: req.body, actor: req.user.kullanici_adi });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: `${count} personel güncellendi.` });
    } catch(e) { next(e); }
});


// ============================================
// 2. BÖLÜM: BİREYSEL İŞLEMLER (GET, POST, :id)
// ============================================

router.get('/users', verifyToken, validateQuery(usersQuery), async (req, res) => {
    try {
        const { durum, departman, arama, page, limit } = req.validatedQuery;
        const offset = (page - 1) * limit;

        const request  = new sql.Request();
        const countReq = new sql.Request();
        let where = `WHERE 1=1`;

        if (durum !== undefined && durum !== 'tumu' && durum !== '') {
            const durumVal = durum === '1' ? 1 : 0;
            where += ` AND Durum = @durum`;
            request.input('durum', sql.Bit, durumVal);
            countReq.input('durum', sql.Bit, durumVal);
        }
        if (departman && departman.trim() !== '') {
            where += ` AND gks_search(Departman) LIKE gks_search(@departman)`;
            request.input('departman', sql.NVarChar, `%${departman}%`);
            countReq.input('departman', sql.NVarChar, `%${departman}%`);
        }
        if (arama && arama.trim() !== '') {
            where += ` AND (gks_search(Ad_Soyad) LIKE gks_search(@arama) OR gks_search(Sicil_No) LIKE gks_search(@arama) OR TC_Kimlik LIKE @arama OR gks_search(RFID_Kart_No) LIKE gks_search(@arama))`;
            request.input('arama', sql.NVarChar, `%${arama}%`);
            countReq.input('arama', sql.NVarChar, `%${arama}%`);
        }

        request.input('offset', sql.Int, offset);
        request.input('limit',  sql.Int, limit);

        const [dataResult, countResult] = await Promise.all([
            request.query(`SELECT * FROM Users ${where} ORDER BY ID DESC LIMIT @limit OFFSET @offset`),
            countReq.query(`SELECT COUNT(*) AS toplam FROM Users ${where}`)
        ]);

        res.json({
            data: dataResult.recordset,
            pagination: { page, limit, total: countResult.recordset[0].toplam, totalPages: Math.ceil(countResult.recordset[0].toplam / limit) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Personeller getirilemedi.' });
    }
});

// Unique index names from 001_initial.sql, so the message names the clashing field.
const UNIQUE_FIELDS = { ux_users_rfid: 'Bu kart numarası', ux_users_tc: 'Bu T.C. kimlik numarası', ux_users_sicil: 'Bu sicil numarası' };
const duplicateMessage = error => UNIQUE_FIELDS[error.constraint]
    ? `${UNIQUE_FIELDS[error.constraint]} başka bir personele ait.`
    : 'T.C., sicil veya kart numarası başka personele ait.';

router.post('/users', verifyToken, verifyAdmin, validate(schemas.personelSchema), async (req, res) => {
    const aktifKullanici = req.user?.kullanici_adi || 'Sistem Yetkilisi';
    const { ad_soyad, rfid, tc, sicil, sirket, departman, gorev, ise_giris } = req.body;

    if (!ad_soyad || !tc || !sicil) return res.status(400).json({ success: false, message: 'Ad, TC ve Kurum Sicil No zorunludur!' });

    // Katı Karakter ve Uzunluk Doğrulamaları (TC: 11, RFID: 11, Sicil: 5)
    if (!/^\d{11}$/.test(tc)) {
        return res.status(400).json({ success: false, message: 'HATA: TC Kimlik numarası tam 11 haneli RAKAM olmalıdır.' });
    }   
    if (rfid && rfid.trim() !== '' && !/^\d{11}$/.test(rfid.trim())) {
        return res.status(400).json({ success: false, message: 'HATA: RFID Kart numarası tam 11 haneli RAKAM olmalıdır.' });
    }
    if (!/^\d{5}$/.test(sicil)) {
        return res.status(400).json({ success: false, message: 'HATA: Kurum sicil numarası tam 5 haneli RAKAM olmalıdır.' });
    }

    let finalRfid = `KART_YOK_${require('crypto').randomUUID()}`;
    if (rfid && typeof rfid === 'string' && rfid.trim() !== '') finalRfid = rfid.trim();
    const finalIseGiris = ise_giris || businessToday();

    try {
        const sistemId = await generateUniqueSistemId();
        await inTransaction(async tx => {
        const request = new sql.Request(tx);
        request.input('tc', sql.NVarChar, tc);
        request.input('sicil', sql.NVarChar, sicil);

        request.input('ad', sql.NVarChar, ad_soyad);
        request.input('rfid', sql.NVarChar, finalRfid);
        request.input('sirket', sql.NVarChar, sirket || '');
        request.input('departman', sql.NVarChar, departman || '');
        request.input('gorev', sql.NVarChar, gorev || '');
        request.input('sistemId', sql.NVarChar, sistemId);
        request.input('ise_giris', sql.Date, finalIseGiris);

        await request.query(`
            INSERT INTO Users (Ad_Soyad, RFID_Kart_No, TC_Kimlik, Sicil_No, Sirket, Departman, Gorev, Durum, Sistem_ID, Ise_Giris_Tarihi) 
            VALUES (@ad, @rfid, @tc, @sicil, @sirket, @departman, @gorev, true, @sistemId, @ise_giris)
        `);
        await addSystemLog(aktifKullanici, 'YENİ KAYIT', ad_soyad, sicil, `Sisteme yeni eklendi. Departman: ${departman || '-'}`, tx);
        });
        socket.getIO().emit('new_system_log');
        socket.getIO().emit('users_updated');
        socket.getIO().emit('system_updated');
        res.json({ success: true, message: 'Personel başarıyla eklendi.' });
    } catch (err) {
        res.status(isUniqueViolation(err) ? 409 : 500).json({ success: false, message: isUniqueViolation(err) ? duplicateMessage(err) : 'Personel kaydedilemedi.' });
    }
});

router.put('/users/:id', verifyToken, verifyAdmin, validate(schemas.personelSchema), async (req, res, next) => {
    const { ad_soyad, rfid, tc, sicil, sirket, departman, gorev, ise_giris } = req.body;
    try {
        await inTransaction(async tx => {
            const request = new sql.Request(tx).input('id', sql.Int, req.params.id);
            const current = (await request.query('SELECT * FROM Users WHERE ID=@id FOR UPDATE')).recordset[0];
            if (!current) throw httpError(404, 'Personel bulunamadı.');
            const start = ise_giris || (current.Ise_Giris_Tarihi ? dateKey(current.Ise_Giris_Tarihi) : businessToday());
            const history = (await request.query('SELECT MAX(Bitis_Tarihi) AS LastExit FROM Personel_Calisma_Gecmisi WHERE User_ID=@id')).recordset[0];
            if (history.LastExit && start <= dateKey(history.LastExit)) throw httpError(409, 'İşe giriş tarihi önceki çalışma dönemiyle çakışamaz.');
            if (current.Isten_Cikis_Tarihi && start > dateKey(current.Isten_Cikis_Tarihi)) throw httpError(400, 'İşe giriş tarihi çıkış tarihinden sonra olamaz.');
            const finalRfid = rfid === undefined ? current.RFID_Kart_No : rfid || `KART_YOK_${require('crypto').randomUUID()}`;
            await request.input('ad', sql.NVarChar, ad_soyad).input('rfid', sql.NVarChar, finalRfid)
                .input('tc', sql.NVarChar, tc).input('sicil', sql.NVarChar, sicil)
                .input('sirket', sql.NVarChar, sirket).input('departman', sql.NVarChar, departman)
                .input('gorev', sql.NVarChar, gorev).input('ise_giris', sql.Date, start)
                .query(`UPDATE Users SET Ad_Soyad=@ad,RFID_Kart_No=@rfid,TC_Kimlik=@tc,Sicil_No=@sicil,
                    Sirket=@sirket,Departman=@departman,Gorev=@gorev,Ise_Giris_Tarihi=@ise_giris WHERE ID=@id`);
            await addSystemLog(req.user.kullanici_adi, 'GÜNCELLEME', ad_soyad, sicil, 'Personel bilgileri güncellendi.', tx);
        });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: 'Personel bilgileri güncellendi.' });
    } catch (error) {
        if (isUniqueViolation(error)) return res.status(400).json({success:false,message:duplicateMessage(error)});
        next(error);
    }
});

router.patch('/users/:id/status', verifyToken, verifyAdmin, validate(schemas.personelStatusSchema), async (req,res,next) => {
    try {
        const count = await changePersonnel({ kind: 'status', userId: req.params.id, target: req.body, value: req.body, actor: req.user.kullanici_adi });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: `${count} personel güncellendi.` });
    } catch(e) { next(e); }
});

router.get('/users/:id/doors', verifyToken, async (req, res) => {
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, req.params.id);
        const result = await request.query(`SELECT p.Door_ID FROM Users u LEFT JOIN Permissions p ON p.User_ID=u.ID WHERE u.ID=@id`);
        if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
        const doorIds = result.recordset.map(r => r.Door_ID).filter(id => id !== null);
        res.json(doorIds);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Yetkiler getirilemedi.' });
    }
});

router.post('/users/:id/doors', verifyToken, verifyAdmin, validate(schemas.personelDoorsSchema), async (req,res,next) => {
    try {
        const count = await changePersonnel({ kind: 'doors', userId: req.params.id, target: req.body, value: req.body, actor: req.user.kullanici_adi });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: `${count} personel güncellendi.` });
    } catch(e) { next(e); }
});

router.get('/users/:id/shift', verifyToken, async (req, res) => {
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, req.params.id);
        
        const result = await request.query(`
            SELECT pv.Vardiya_ID FROM Users u LEFT JOIN Personel_Vardiya pv
            ON pv.User_ID=u.ID AND pv.Bitis_Tarihi IS NULL WHERE u.ID=@id
        `);
        
        if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
        res.json({ vardiya_id: result.recordset[0].Vardiya_ID ?? '' });
    } catch (err) {
        logger.error('Personel vardiya çekme hatası: ' + err.message);
        res.status(500).json({ success: false, message: 'Vardiya bilgisi getirilemedi.' });
    }
});

router.post('/users/:id/shift', verifyToken, verifyAdmin, validate(schemas.personelShiftSchema), async (req,res,next) => {
    try {
        const count = await changePersonnel({ kind: 'shift', userId: req.params.id, target: req.body, value: req.body, actor: req.user.kullanici_adi });
        for (const event of ['users_updated','system_updated','new_system_log']) socket.getIO().emit(event);
        res.json({ success: true, message: `${count} personel güncellendi.` });
    } catch(e) { next(e); }
});

module.exports = router;
