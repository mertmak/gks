const test = require('node:test');
const assert = require('node:assert/strict');

test('card replacement and reassignment preserve captured event ownership', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    const { attendance } = require('../services/attendance');
    await sql.query(`
      INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No,Sistem_ID,Ise_Giris_Tarihi) VALUES
        ('History A','card-a','history-a','history-a','2026-01-01'),
        ('History B','card-b','history-b','history-b','2026-01-01');
      INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Calisma_Gunleri) VALUES('History Shift','09:00','18:00','1,2,3,4,5');
      INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) SELECT ID,(SELECT ID FROM Vardiyalar),'2026-01-01' FROM Users;
      INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('History In','Ana Giriş'),('History Out','Ana Çıkış');
      INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi) VALUES
        ('card-a',(SELECT ID FROM Doors WHERE Kapi_Adi='History In'),'2026-09-07T09:00:00',true),
        ('card-a',(SELECT ID FROM Doors WHERE Kapi_Adi='History Out'),'2026-09-07T19:00:00',true),
        ('unknown',(SELECT ID FROM Doors WHERE Kapi_Adi='History In'),'2026-09-07T09:00:00',true);
    `);
    const users = (await sql.query('SELECT ID FROM Users ORDER BY ID')).recordset;
    const [a, b] = users.map(user => user.ID);
    const before = await attendance('2026-09-07', '2026-09-07');
    assert.equal(before.find(row => row.User_ID === a).Hesaplanan_Dk, 60);
    await sql.query("UPDATE Users SET RFID_Kart_No='card-new' WHERE Sicil_No='history-a'; UPDATE Users SET RFID_Kart_No='card-a' WHERE Sicil_No='history-b'");
    const after = await attendance('2026-09-07', '2026-09-07');
    assert.equal(after.find(row => row.User_ID === a).Hesaplanan_Dk, 60);
    assert.equal(after.find(row => row.User_ID === b).Durum, 'Devamsız');
    assert.equal((await attendance('2026-09-07','2026-09-07',{userId:a}))[0].Hesaplanan_Dk,60);
    await sql.query(`INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi)
      SELECT 'card-a',ID,'2026-09-08T09:00:00',true FROM Doors WHERE Kapi_Adi='History In'`);
    assert.equal((await sql.query("SELECT User_ID FROM Logs WHERE Zaman='2026-09-08T09:00:00'")).recordset[0].User_ID,b);
    await sql.query("UPDATE Users SET RFID_Kart_No='unknown' WHERE Sicil_No='history-b'");
    assert.equal((await sql.query("SELECT User_ID FROM Logs WHERE RFID_Kart_No='unknown'")).recordset[0].User_ID,null);
    assert.equal((await attendance('2026-09-07','2026-09-07',{userId:b}))[0].Durum,'Devamsız');
    await t.test('editing a definition changes new assignments but preserves old reports', async () => {
        await sql.query("UPDATE Vardiyalar SET Vardiya_Adi='Changed Shift',Mesai_Bitis='20:00',Tolerans_Dk=120,Calisma_Gunleri='0,6'");
        const historical = (await attendance('2026-09-07','2026-09-07',{userId:a}))[0];
        assert.equal(historical.Vardiya_Adi,'History Shift');
        assert.equal(historical.Hesaplanan_Dk,60);
        assert.equal(historical.Calisma_Gunleri,'1,2,3,4,5');
        await sql.query(`UPDATE Personel_Vardiya SET Bitis_Tarihi='2026-09-07';
          INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) SELECT ID,(SELECT ID FROM Vardiyalar),'2026-09-08' FROM Users`);
        const assigned = (await attendance('2026-09-08','2026-09-08',{userId:a}))[0];
        assert.equal(assigned.Vardiya_Adi,'Changed Shift');
        assert.equal(assigned.Tolerans_Dk,120);
        assert.equal((await attendance('2026-09-07','2026-09-07',{userId:a}))[0].Hesaplanan_Dk,60);
    });
    const owners = (await sql.query('SELECT L.RFID_Kart_No,U.Ad_Soyad FROM Logs L LEFT JOIN Users U ON U.ID=L.User_ID ORDER BY L.ID')).recordset;
    assert.equal(owners[0].Ad_Soyad,'History A');
    assert.equal(owners[2].Ad_Soyad,null);
});

