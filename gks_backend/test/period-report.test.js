const test = require('node:test');
const assert = require('node:assert/strict');

test('period attendance report', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    await sql.query(`
      INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('period-viewer','x','user');
      INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No,Sistem_ID,Departman,Ise_Giris_Tarihi,Isten_Cikis_Tarihi,Durum) VALUES
        ('Gece','pr-1','pr-1','pr-1','Üretim','2026-01-01',NULL,true),
        ('Yeni','pr-2','pr-2','pr-2','Üretim','2026-09-15',NULL,true),
        ('Ayrılan','pr-3','pr-3','pr-3','Ofis','2026-01-01','2026-09-10',false);
      INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Calisma_Gunleri) VALUES('Gece','22:00','06:00','1,2,3,4,5'),('Gündüz','09:00','18:00','1,2,3,4,5');
      INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi)
        SELECT U.ID,V.ID,'2026-01-01' FROM Users U JOIN Vardiyalar V ON V.Vardiya_Adi=CASE WHEN U.Ad_Soyad='Gece' THEN 'Gece' ELSE 'Gündüz' END;
      INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('Giriş','Ana Giriş'),('Çıkış','Ana Çıkış');
      INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi) VALUES
        ('pr-1',(SELECT ID FROM Doors WHERE Kapi_Adi='Giriş'),'2026-09-30T22:00:00',true),
        ('pr-1',(SELECT ID FROM Doors WHERE Kapi_Adi='Çıkış'),'2026-10-01T06:00:00',true);
    `);
    const ids = Object.fromEntries((await sql.query('SELECT ID,Ad_Soyad FROM Users')).recordset.map(u => [u.Ad_Soyad, u.ID]));
    const account = (await sql.query("SELECT ID,Rol,Kullanici_Adi,Token_Version FROM Yoneticiler")).recordset[0];
    const token = require('jsonwebtoken').sign({ id: account.ID, role: account.Rol, kullanici_adi: account.Kullanici_Adi, version: account.Token_Version }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const { app } = require('../server');
    const server = require('http').createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise(r => server.close(r)));
    const get = async query => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/reports/attendance?${new URLSearchParams(query)}`, { headers: { Authorization: `Bearer ${token}` } });
        return { status: res.status, data: await res.json() };
    };
    const person = (data, name) => data.ozet.find(p => p.User_ID === ids[name]);

    await t.test('month: hire and exit inside the period, night shift ending next month', async () => {
        const { status, data } = await get({ donem: 'ay', baslangic: '2026-09-17', kapsam: 'tumu' });
        assert.equal(status, 200);
        assert.deepEqual([data.baslangic, data.bitis], ['2026-09-01', '2026-09-30']);
        assert.equal(person(data, 'Gece').Gun, 30);
        assert.equal(person(data, 'Yeni').Gun, 16);
        assert.equal(person(data, 'Ayrılan').Gun, 10);
        const night = person(data, 'Gece');
        assert.equal(night.Calisilan_Gun, 1);
        assert.equal(night.Calisma_Dk, 480);
        assert.equal(night.Devamsiz_Gun, 21);
        assert.equal(night.Hafta_Tatili, 8);
        assert.equal(data.toplam.Gun, data.gunler.length);
    });
    await t.test('week is Monday to Sunday', async () => {
        const { data } = await get({ donem: 'hafta', baslangic: '2026-09-30', kapsam: 'tumu' });
        assert.deepEqual([data.baslangic, data.bitis], ['2026-09-28', '2026-10-04']);
        assert.equal(data.gunler.length, 14, 'the person who left is not listed');
    });
    await t.test('department, selected and single-person scopes', async () => {
        const office = (await get({ donem: 'ay', baslangic: '2026-09-01', kapsam: 'departman', departman: 'Ofis' })).data;
        assert.deepEqual(office.ozet.map(p => p.User_ID), [ids['Ayrılan']]);
        const chosen = (await get({ donem: 'ozel', baslangic: '2026-09-28', bitis: '2026-09-29', kapsam: 'secili', personel: `${ids['Gece']},${ids['Ayrılan']}` })).data;
        assert.deepEqual(chosen.ozet.map(p => p.User_ID), [ids['Gece']]);
        const one = (await get({ donem: 'hafta', baslangic: '2026-09-28', kapsam: 'kisi', personel: ids['Yeni'] })).data;
        assert.equal(one.gunler.every(row => row.User_ID === ids['Yeni']), true);
        assert.equal(one.gunler.length, 7);
    });
    await t.test('invalid ranges and scopes are 400', async () => {
        assert.equal((await get({ donem: 'ozel', baslangic: '2026-09-01', bitis: '2026-12-02', kapsam: 'tumu' })).status, 400);
        assert.equal((await get({ donem: 'ozel', baslangic: '2026-09-02', bitis: '2026-09-01', kapsam: 'tumu' })).status, 400);
        assert.equal((await get({ donem: 'ay', baslangic: '2026-09-01', kapsam: 'kisi' })).status, 400);
        assert.equal((await get({ donem: 'ay', baslangic: '2026-02-30', kapsam: 'tumu' })).status, 400);
    });
});
