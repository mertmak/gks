const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('door simulation plans a day and decides card reads on the server', { skip: process.env.RUN_SIM_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    const express = require('express');
    const app = express();
    app.use(express.json());
    for (const name of ['doorSimulation', 'report']) app.use('/api', require(`../routes/${name}Routes`));
    app.use(require('../middlewares/errorHandler'));
    const server = require('http').createServer(app);
    const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));

    await sql.query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('sim-admin','x','admin'),('sim-viewer','x','user')");
    const shift = (await sql.query("INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Yemek_Baslangic,Yemek_Bitis,Tolerans_Dk) VALUES('Gündüz','09:00','18:00','12:30','13:30',10) RETURNING ID")).recordset[0].ID;
    await sql.query(`INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Durum,Ise_Giris_Tarihi) VALUES
        ('Ayşe Yetkili','30000000001',true,'2026-01-01'),('Burak Yetkisiz','30000000002',true,'2026-01-01'),
        ('Cem Pasif','30000000003',false,'2026-01-01'),('Deniz İzinli','30000000004',true,'2026-01-01'),('Ece Kartsız','',true,'2026-01-01')`);
    const users = Object.fromEntries((await sql.query('SELECT ID, Ad_Soyad FROM Users')).recordset.map(row => [row.Ad_Soyad.split(' ')[0], row.ID]));
    await new sql.Request().input('shift', sql.Int, shift).query("INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) SELECT ID,@shift,'2026-01-01' FROM Users");
    await new sql.Request().input('id', sql.Int, users.Deniz).query("INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi) VALUES(@id,'Yıllık İzin','2026-09-08','2026-09-08')");
    await sql.query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('Giriş','Ana Giriş'),('Çıkış','Ana Çıkış'),('Arşiv','İç Geçiş')");
    const doors = Object.fromEntries((await sql.query('SELECT ID, Kapi_Adi FROM Doors')).recordset.map(row => [row.Kapi_Adi, row.ID]));
    await sql.query("UPDATE Doors SET Durum=false WHERE Kapi_Adi='Arşiv'");
    await sql.query("INSERT INTO Permissions(User_ID,Door_ID) SELECT U.ID,D.ID FROM Users U CROSS JOIN Doors D WHERE U.Ad_Soyad<>'Burak Yetkisiz' OR D.Kapi_Adi='Giriş'");

    const accounts = (await sql.query('SELECT ID,Rol,Kullanici_Adi FROM Yoneticiler')).recordset;
    const token = role => { const a = accounts.find(row => row.Rol === role); return jwt.sign({ id: a.ID, role: a.Rol, kullanici_adi: a.Kullanici_Adi, version: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' }); };
    const admin = token('admin');
    const root = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, endpoint, body, auth = admin) => {
        const r = await fetch(root + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, data: await r.json() };
    };
    const logCount = async () => (await sql.query('SELECT COUNT(*) AS n FROM Logs')).recordset[0].n;

    await t.test('the plan covers active people with a card and a shift that day', async () => {
        const plan = await call('GET', '/simulasyon/plan?tarih=2026-09-08');
        assert.equal(plan.status, 200, JSON.stringify(plan.data));
        const byName = Object.fromEntries(plan.data.kisiler.map(person => [person.ad_soyad.split(' ')[0], person]));
        assert.deepEqual(Object.keys(byName).sort(), ['Ayşe', 'Burak', 'Deniz']);
        assert.equal(byName.Deniz.durum, 'İzinli');
        assert.deepEqual(byName.Deniz.olaylar, []);
        assert.deepEqual(byName.Burak.kapilar, [doors.Giriş]);
        const events = byName.Ayşe.olaylar;
        assert.equal(byName.Ayşe.durum, 'Planlı');
        assert.equal(events[0].tur, 'giris');
        assert.equal(events.at(-1).tur, 'cikis');
        assert.ok(events.some(event => event.tur === 'yemek') && events.some(event => event.tur === 'yemekten_don'));
        assert.ok(events.every((event, i) => /^2026-09-08T\d{2}:\d{2}:\d{2}$/.test(event.zaman) && (!i || event.zaman >= events[i - 1].zaman)));
        assert.equal(await logCount(), 0, 'planning writes nothing');
        const weekend = await call('GET', '/simulasyon/plan?tarih=2026-09-12&devamsiz=50');
        assert.ok(weekend.data.kisiler.filter(person => person.durum !== 'İzinli').every(person => person.durum === 'Hafta Tatili'));
        const absent = await call('GET', '/simulasyon/plan?tarih=2026-09-09&devamsiz=50&gec=50');
        assert.equal(absent.status, 200);
        for (const query of ['tarih=2026-09-31', 'tarih=2026-09-08&gec=60', 'gec=10']) assert.equal((await call('GET', '/simulasyon/plan?' + query)).status, 400, query);
        assert.equal((await call('GET', '/simulasyon/plan?tarih=2026-09-08', undefined, token('user'))).status, 403);
    });

    await t.test('reads are decided like a door controller and stored with their result', async () => {
        const read = (kart, kapi, zaman) => ({ kart, kapi_id: doors[kapi], zaman: '2026-09-08T' + zaman });
        const result = await call('POST', '/simulasyon/okutma', { tarih: '2026-09-08', okutmalar: [
            read('30000000001', 'Giriş', '08:55:00'), read('30000000002', 'Çıkış', '09:10:00'), read('99999999999', 'Giriş', '09:11:00'),
            read('30000000001', 'Arşiv', '09:12:00'), read('30000000003', 'Giriş', '09:13:00'),
        ] });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.deepEqual(result.data.sonuclar.map(row => [row.basarili, row.neden]), [
            [true, 'Geçiş onaylandı'], [false, 'Kapı yetkisi yok'], [false, 'Tanımsız kart'], [false, 'Kapı pasif'], [false, 'Personel pasif'],
        ]);
        assert.equal(result.data.sonuclar[0].user_id, users.Ayşe);
        assert.equal(result.data.sonuclar[2].user_id, null);
        const logs = (await sql.query('SELECT User_ID, Basarili_Mi, Zaman FROM Logs ORDER BY ID')).recordset;
        assert.deepEqual(logs.map(row => row.Basarili_Mi), [true, false, false, false, false]);
        assert.deepEqual([logs[0].User_ID, logs[2].User_ID], [users.Ayşe, null]);
        assert.equal(logs[0].Zaman.toISOString(), '2026-09-08T08:55:00.000Z');
    });

    await t.test('accepted reads feed the attendance report', async () => {
        const exit = await call('POST', '/simulasyon/okutma', { tarih: '2026-09-08', okutmalar: [{ kart: '30000000001', kapi_id: doors.Çıkış, zaman: '2026-09-08T18:10:00' }] });
        assert.equal(exit.status, 200);
        const report = (await call('GET', '/reports/daily-attendance?tarih=2026-09-08')).data;
        const row = report.find(item => item.User_ID === users.Ayşe);
        assert.deepEqual([row.Durum, row.Hesaplanan_Dk], ['Normal', 10]);
        assert.equal(report.find(item => item.User_ID === users.Burak).Durum, 'Devamsız', 'denied reads do not count');
    });

    await t.test('invalid batches are rejected without writing', async () => {
        const before = await logCount();
        const read = { kart: '30000000001', kapi_id: doors.Giriş, zaman: '2026-09-08T10:00:00' };
        for (const body of [
            { tarih: '2026-09-08', okutmalar: [{ ...read, zaman: '2026-09-11T10:00:00' }] },
            { tarih: '2026-09-08', okutmalar: [{ ...read, zaman: '2026-09-08 10:00' }] },
            { tarih: '2026-09-08', okutmalar: Array(51).fill(read) },
            { tarih: '2026-09-08', okutmalar: [] },
            { tarih: '2026-09-08', okutmalar: [{ ...read, kart: '' }] },
        ]) assert.equal((await call('POST', '/simulasyon/okutma', body)).status, 400);
        assert.equal((await call('POST', '/simulasyon/okutma', { tarih: '2026-09-08', okutmalar: [read, { ...read, kapi_id: 999999 }] })).status, 404);
        assert.equal((await call('POST', '/simulasyon/okutma', { tarih: '2026-09-08', okutmalar: [read] }, token('user'))).status, 403);
        assert.equal(await logCount(), before);
    });

    await t.test('on the plan, the areas a read crosses decide its meaning, frozen in the log', async () => {
        const floor = (await sql.query("INSERT INTO Katlar(Kat_Adi,Sira) VALUES('Zemin',0) RETURNING ID")).recordset[0].ID;
        const area = async (name, type) => (await new sql.Request().input('kat', sql.Int, floor).input('ad', sql.NVarChar, name).input('tur', sql.NVarChar, type)
            .query("INSERT INTO Bolgeler(Kat_ID,Bolge_Adi,Bolge_Turu,Noktalar) VALUES(@kat,@ad,@tur,'[[0,0],[100,0],[100,100],[0,100]]') RETURNING ID")).recordset[0].ID;
        const lobby = await area('Lobi', 'Lobi'), office = await area('Ofis', 'Ofis'), cafeteria = await area('Yemekhane', 'Yemekhane');
        // Door types are deliberately misleading: only the areas count.
        const door = async (name, type, a, b, rule = 'Çift') => (await new sql.Request().input('ad', sql.NVarChar, name).input('tur', sql.NVarChar, type)
            .input('a', sql.Int, a).input('b', sql.Int, b).input('yon', sql.NVarChar, rule)
            .query('INSERT INTO Doors(Kapi_Adi,Kapi_Turu,Plan_X,Plan_Y,Bolge_A_ID,Bolge_B_ID,Yon_Kisiti) VALUES(@ad,@tur,0,0,@a,@b,@yon) RETURNING ID')).recordset[0].ID;
        const turnstile = await door('Turnike', 'İç Geçiş', null, lobby, 'A→B');
        const back = await door('Arka Kapı', 'Ana Giriş', lobby, null);
        const fromOffice = await door('Ofis Kapısı', 'İç Geçiş', office, cafeteria);
        const fromLobby = await door('Lobi Kapısı', 'Ana Çıkış', lobby, cafeteria);
        await new sql.Request().input('id', sql.Int, users.Ayşe).query("INSERT INTO Permissions(User_ID,Door_ID) SELECT @id,ID FROM Doors WHERE Plan_X IS NOT NULL");
        const read = (kapi_id, zaman, yon) => ({ kart: '30000000001', kapi_id, zaman: '2026-09-09T' + zaman, yon });
        const before = await logCount();
        assert.equal((await call('POST', '/simulasyon/okutma', { tarih: '2026-09-09', okutmalar: [read(turnstile, '08:50:00')] })).status, 400, 'a plan door needs a direction');
        assert.equal((await call('POST', '/simulasyon/okutma', { tarih: '2026-09-09', okutmalar: [read(turnstile, '08:50:00', 'yukarı')] })).status, 400);
        assert.equal(await logCount(), before);
        const result = await call('POST', '/simulasyon/okutma', { tarih: '2026-09-09', okutmalar: [
            read(turnstile, '08:50:00', 'A→B'), read(fromOffice, '12:30:00', 'A→B'), read(fromLobby, '13:00:00', 'B→A'),
            read(turnstile, '18:00:00', 'B→A'), read(back, '18:01:00', 'A→B'),
        ] });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.deepEqual(result.data.sonuclar.map(row => [row.basarili, row.neden, row.gecis_anlami]), [
            [true, 'Geçiş onaylandı', 'Ana Giriş'], [true, 'Geçiş onaylandı', 'Yemekhane Giriş'], [true, 'Geçiş onaylandı', 'Yemekhane Çıkış'],
            [false, 'Bu yönde geçiş kapalı', 'Ana Çıkış'], [true, 'Geçiş onaylandı', 'Ana Çıkış'],
        ]);
        // Doors off the plan keep working without a direction and store no meaning.
        const plain = await call('POST', '/simulasyon/okutma', { tarih: '2026-09-10', okutmalar: [{ kart: '30000000001', kapi_id: doors.Giriş, zaman: '2026-09-10T09:00:00' }] });
        assert.deepEqual([plain.status, plain.data.sonuclar[0].gecis_anlami], [200, null]);
        const report = async () => (await call('GET', '/reports/daily-attendance?tarih=2026-09-09')).data.find(item => item.User_ID === users.Ayşe);
        const row = await report();
        assert.deepEqual([row.Durum, row.Toplam_Yemek_Dk, row.Hesaplanan_Dk, row.Ilk_Giris, row.Son_Cikis], ['Normal', 30, 1, '2026-09-09T08:50:00.000Z', '2026-09-09T18:01:00.000Z']);
        // A later plan change does not rewrite the past.
        await sql.query("UPDATE Bolgeler SET Bolge_Turu='Diğer' WHERE Bolge_Adi='Yemekhane'");
        await new sql.Request().input('id', sql.Int, fromLobby).query('UPDATE Doors SET Plan_X=NULL, Plan_Y=NULL, Bolge_A_ID=NULL, Bolge_B_ID=NULL WHERE ID=@id');
        assert.deepEqual(await report(), row);
    });

    await t.test('a re-run day reports its existing logs and can clear them first', async () => {
        const plan = async () => (await call('GET', '/simulasyon/plan?tarih=2026-09-10')).data.mevcut_kayit;
        assert.equal(await plan(), 1);
        assert.equal((await call('DELETE', '/simulasyon/gun?tarih=2026-09-10', undefined, token('user'))).status, 403);
        assert.equal((await call('DELETE', '/simulasyon/gun?tarih=2026-09-31')).status, 400);
        assert.deepEqual((await call('DELETE', '/simulasyon/gun?tarih=2026-09-10')).data, { success: true, silinen: 1 });
        assert.equal(await plan(), 0);
        assert.equal((await call('GET', '/simulasyon/plan?tarih=2026-09-09')).data.mevcut_kayit > 0, true, 'other days keep their logs');
    });
});
