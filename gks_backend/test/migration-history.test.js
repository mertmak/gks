const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy migration backfills identities and shift definitions without claiming unknown cards', {skip:process.env.RUN_DB_TESTS!=='true'}, async t => {
    await require('../test-support/database').createTestDatabase(t, { beforeMigration: async pool => {
        for (const file of ['001_initial.sql','002_integrity.sql']) {
            await pool.request().batch(fs.readFileSync(path.resolve(__dirname,'../../database/migrations',file),'utf8'));
        }
        await pool.request().query(`
          INSERT INTO Users(Ad_Soyad,RFID_Kart_No) VALUES(N'Legacy Fixture',N'legacy-card');
          INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES(N'Legacy Door',N'Ana Giriş');
          INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi)
            SELECT N'legacy-card',ID,'2026-09-07T09:00:00',1 FROM Doors
            UNION ALL SELECT N'legacy-unknown',ID,'2026-09-07T09:00:00',0 FROM Doors;
          INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Tolerans_Dk) VALUES(N'Legacy Shift','09:00','18:00',10);
          INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) SELECT U.ID,V.ID,'2026-01-01' FROM Users U CROSS JOIN Vardiyalar V;
        `);
    }});
    const {sql,connectDB}=require('../db');await connectDB();
    const uid=(await sql.query('SELECT ID FROM Users')).recordset[0].ID;
    const logs=(await sql.query('SELECT User_ID FROM Logs ORDER BY ID')).recordset;
    assert.equal(logs[0].User_ID,uid);assert.equal(logs[1].User_ID,null);
    const before=(await sql.query('SELECT Snapshot_Vardiya_Adi,Snapshot_Tolerans_Dk FROM Personel_Vardiya')).recordset[0];
    assert.deepEqual(before,{Snapshot_Vardiya_Adi:'Legacy Shift',Snapshot_Tolerans_Dk:10});
    await sql.query("UPDATE Users SET RFID_Kart_No=N'legacy-unknown'; UPDATE Vardiyalar SET Vardiya_Adi=N'New Definition',Tolerans_Dk=90");
    const {execFileSync}=require('node:child_process');
    execFileSync(process.execPath,['scripts/migrate.js'],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:'pipe'});
    assert.deepEqual((await sql.query('SELECT User_ID FROM Logs ORDER BY ID')).recordset,logs);
    assert.deepEqual((await sql.query('SELECT Snapshot_Vardiya_Adi,Snapshot_Tolerans_Dk FROM Personel_Vardiya')).recordset[0],before);
});
