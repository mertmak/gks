const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('floor plan template, bulk save and validation', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { connectDB, sql } = require('../db');
    await connectDB();
    await sql.query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('plan-admin','x','admin'),('plan-viewer','x','user')");
    await sql.query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('Giriş 1','Ana Giriş'),('Koridor','İç Geçiş'),('Eski Kapı','Ana Çıkış')");
    await sql.query("UPDATE Doors SET Durum=false WHERE Kapi_Adi='Eski Kapı'");
    const { app } = require('../server');
    const server = require('http').createServer(app);
    const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));
    const accounts = (await sql.query('SELECT ID,Rol,Kullanici_Adi,Token_Version FROM Yoneticiler')).recordset;
    const token = role => {
        const a = accounts.find(row => row.Rol === role);
        return jwt.sign({ id: a.ID, role: a.Rol, kullanici_adi: a.Kullanici_Adi, version: a.Token_Version }, process.env.JWT_SECRET, { expiresIn: '5m' });
    };
    const admin = token('admin'), viewer = token('user');
    const root = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, endpoint, body, auth = admin) => {
        const r = await fetch(root + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, data: await r.json() };
    };
    const plan = async () => (await call('GET', '/kat-plani')).data;

    await t.test('an empty plan is readable by every account; only admins change it', async () => {
        const empty = (await call('GET', '/kat-plani', undefined, viewer)).data;
        assert.deepEqual(empty.bolgeler, []);
        assert.equal(empty.kapilar.length, 3);
        assert.ok(empty.kapilar.every(door => door.Plan_X === null && door.Yetkili_Sayisi === 0));
        assert.equal((await call('PUT', '/kat-plani', { bolgeler: [], kapilar: [] }, viewer)).status, 403);
        assert.equal((await call('POST', '/kat-plani/sablon', undefined, viewer)).status, 403);
    });

    await t.test('the template adds missing door types and places every door it can', async () => {
        const result = await call('POST', '/kat-plani/sablon');
        assert.equal(result.status, 200, JSON.stringify(result.data));
        // Ana Çıkış has only a passive door, so it is added like the three missing types.
        assert.equal(result.data.created, 4);
        assert.equal(result.data.placed, 7);
        const current = await plan();
        assert.equal(current.bolgeler.length, 5);
        const lobby = current.bolgeler.find(area => area.Bolge_Turu === 'Lobi').ID;
        const entry = current.kapilar.find(door => door.Kapi_Adi === 'Giriş 1');
        assert.deepEqual([entry.Plan_X, entry.Plan_Y, entry.Bolge_A_ID, entry.Bolge_B_ID], [40, 280, null, lobby]);
        // Active doors take the first slot of their type.
        assert.equal(current.kapilar.find(door => door.Kapi_Adi === 'Plan Ana Çıkış').Plan_Y, 360);
        assert.equal(current.kapilar.find(door => door.Kapi_Adi === 'Eski Kapı').Plan_Y, 400);
        assert.ok(current.kapilar.every(door => door.Plan_X !== null));
        const logs = (await sql.query("SELECT Islem_Tipi FROM DoorLogs ORDER BY ID")).recordset.map(row => row.Islem_Tipi);
        assert.deepEqual(logs, [...Array(4).fill('YENİ KAPI'), 'KAT PLANI GÜNCELLENDİ']);
        assert.equal((await call('POST', '/kat-plani/sablon')).status, 409);
    });

    await t.test('a save replaces the whole plan in one transaction', async () => {
        const current = await plan();
        const keep = current.bolgeler.filter(area => area.Bolge_Turu !== 'Diğer').map(area => ({
            id: area.ID, ref: 'b' + area.ID, bolge_adi: area.Bolge_Adi, bolge_turu: area.Bolge_Turu, x: area.X, y: area.Y, genislik: area.Genislik, yukseklik: area.Yukseklik,
        }));
        keep[0].bolge_adi = 'Giriş Holü';
        const office = keep.find(area => area.bolge_turu === 'Ofis');
        const body = {
            bolgeler: [...keep, { ref: 'yeni', bolge_adi: 'Arşiv', bolge_turu: 'Diğer', x: 540, y: 440, genislik: 180, yukseklik: 200 }],
            kapilar: [{ id: current.kapilar[1].ID, plan_x: 620, plan_y: 440, bolge_a: office.ref, bolge_b: 'yeni' }],
        };
        const saved = await call('PUT', '/kat-plani', body);
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        const after = await plan();
        assert.equal(after.bolgeler.length, 5);
        assert.ok(after.bolgeler.some(area => area.Bolge_Adi === 'Giriş Holü'));
        assert.ok(!after.bolgeler.some(area => area.Bolge_Adi === 'Toplantı Odası'));
        const archive = after.bolgeler.find(area => area.Bolge_Adi === 'Arşiv').ID;
        const placed = after.kapilar.filter(door => door.Plan_X !== null);
        assert.equal(placed.length, 1);
        assert.deepEqual([placed[0].ID, placed[0].Bolge_A_ID, placed[0].Bolge_B_ID], [current.kapilar[1].ID, office.id, archive]);
        const audit = (await sql.query('SELECT Detay, Islemi_Yapan FROM DoorLogs ORDER BY ID DESC LIMIT 1')).recordset[0];
        assert.deepEqual(audit, { Detay: '5 bölge, 1 yerleşik kapı.', Islemi_Yapan: 'plan-admin' });
    });

    await t.test('invalid plans are rejected without changes', async () => {
        const before = await plan();
        const area = { ref: 'a', bolge_adi: 'A', x: 0, y: 0, genislik: 100, yukseklik: 100 };
        const door = { id: before.kapilar[0].ID, plan_x: 0, plan_y: 50 };
        for (const body of [
            { bolgeler: [area], kapilar: [{ ...door, bolge_a: 'yok' }] },
            { bolgeler: [area], kapilar: [{ ...door, bolge_a: 'a', bolge_b: 'a' }] },
            { bolgeler: [{ ...area, x: 1950 }], kapilar: [] },
            { bolgeler: [{ ...area, genislik: 20 }], kapilar: [] },
            { bolgeler: [area, area], kapilar: [] },
            { bolgeler: [area], kapilar: [door, door] },
            { bolgeler: Array.from({ length: 31 }, (_, i) => ({ ...area, ref: 'r' + i })), kapilar: [] },
        ]) assert.equal((await call('PUT', '/kat-plani', body)).status, 400, JSON.stringify(body));
        assert.equal((await call('PUT', '/kat-plani', { bolgeler: [area], kapilar: [{ ...door, id: 999999 }] })).status, 404);
        assert.equal((await call('PUT', '/kat-plani', { bolgeler: [{ ...area, id: 999999 }], kapilar: [] })).status, 404);
        assert.deepEqual(await plan(), before);
    });

    await t.test('permitted active personnel are counted per door', async () => {
        const door = (await plan()).kapilar[0].ID;
        await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Durum) VALUES('Aktif','10000000001',true),('Pasif','10000000002',false)");
        await new sql.Request().input('door', sql.Int, door).query('INSERT INTO Permissions(User_ID,Door_ID) SELECT ID,@door FROM Users');
        assert.equal((await plan()).kapilar[0].Yetkili_Sayisi, 1);
    });
});
