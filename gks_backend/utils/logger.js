const { sql } = require('../db');
const socket = require('./socket');
const appLogger = require('./appLogger');

const addSystemLog = async (islemiYapan, islemTipi, personelAd, sicil, detay, transaction) => {
    try {
        const req = new sql.Request(transaction);
        req.input('yapan', sql.NVarChar, islemiYapan || 'Sistem Yetkilisi');
        req.input('islem', sql.NVarChar, islemTipi);
        req.input('kisi', sql.NVarChar, personelAd);
        req.input('sicil', sql.NVarChar, sicil || '');
        req.input('detay', sql.NVarChar, detay || '');
        await req.query(`
            INSERT INTO SystemLogs (Islemi_Yapan, Islem_Tipi, Personel_Ad, Sicil_No, Detay) 
            VALUES (@yapan, @islem, @kisi, @sicil, @detay)
        `);
        if (!transaction) socket.getIO().emit('new_system_log');
    } catch (err) {
        if (transaction) throw err;
        appLogger.error('Sistem logu yazılamadı: ' + err.message);
    }
};

const addDoorLog = async (islemiYapan, islemTipi, kapiAdi, detay, transaction) => {
    try {
        const req = new sql.Request(transaction);
        req.input('yapan', sql.NVarChar, islemiYapan || 'Sistem Yetkilisi');
        req.input('islem', sql.NVarChar, islemTipi);
        req.input('kapi', sql.NVarChar, kapiAdi);
        req.input('detay', sql.NVarChar, detay || '');
        await req.query(`
            INSERT INTO DoorLogs (Islemi_Yapan, Islem_Tipi, Kapi_Adi, Detay) 
            VALUES (@yapan, @islem, @kapi, @detay)
        `);
        if (!transaction) socket.getIO().emit('new_door_log');
    } catch (err) {
        if (transaction) throw err;
        appLogger.error('Kapı logu yazılamadı: ' + err.message);
    }
};

module.exports = { addSystemLog, addDoorLog };