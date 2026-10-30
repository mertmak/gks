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
    await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No) VALUES('Şablon Kişisi','10000000009')");
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
        assert.deepEqual([empty.katlar, empty.bolgeler], [[], []]);
        assert.equal(empty.kapilar.length, 3);
        assert.ok(empty.kapilar.every(door => door.Plan_X === null && door.Yetkili_Sayisi === 0 && door.Yon_Kisiti === 'Çift'));
        assert.equal((await call('PUT', '/kat-plani', { katlar: [], bolgeler: [], kapilar: [] }, viewer)).status, 403);
        assert.equal((await call('POST', '/kat-plani/sablon', undefined, viewer)).status, 403);
    });

    await t.test('the template adds missing door types and places every door it can', async () => {
        const result = await call('POST', '/kat-plani/sablon');
        assert.equal(result.status, 200, JSON.stringify(result.data));
        // Ana Çıkış has only a passive door, so it is added like the three missing
        // types; a second inner door is the way back from the break area.
        assert.equal(result.data.created, 5);
        assert.equal(result.data.placed, 8);
        const current = await plan();
        assert.equal(current.bolgeler.length, 5);
        assert.deepEqual(current.katlar.map(floor => [floor.Kat_Adi, floor.Sira]), [['Zemin Kat', 0]]);
        assert.ok(current.bolgeler.every(area => area.Kat_ID === current.katlar[0].ID));
        assert.deepEqual(current.bolgeler.find(area => area.Bolge_Turu === 'Lobi').Noktalar, [[40, 200], [240, 200], [240, 440], [40, 440]]);
        const lobby = current.bolgeler.find(area => area.Bolge_Turu === 'Lobi').ID;
        const entry = current.kapilar.find(door => door.Kapi_Adi === 'Giriş 1');
        assert.deepEqual([entry.Plan_X, entry.Plan_Y, entry.Bolge_A_ID, entry.Bolge_B_ID], [40, 280, null, lobby]);
        // Active doors take the first slot of their type.
        assert.equal(current.kapilar.find(door => door.Kapi_Adi === 'Plan Ana Çıkış').Plan_Y, 360);
        assert.equal(current.kapilar.find(door => door.Kapi_Adi === 'Eski Kapı').Plan_Y, 400);
        const areaId = type => current.bolgeler.find(area => area.Bolge_Turu === type).ID;
        const back = current.kapilar.find(door => door.Kapi_Adi === 'Plan İç Geçiş 2');
        assert.deepEqual([back.Bolge_A_ID, back.Bolge_B_ID], [areaId('Ofis'), areaId('Mola')]);
        // Added doors are usable at once; existing permissions are not touched.
        assert.ok(current.kapilar.filter(door => door.Kapi_Adi.startsWith('Plan ')).every(door => door.Yetkili_Sayisi === 1));
        assert.equal(current.kapilar.find(door => door.Kapi_Adi === 'Koridor').Yetkili_Sayisi, 0);
        assert.ok(current.kapilar.every(door => door.Plan_X !== null));
        const logs = (await sql.query("SELECT Islem_Tipi FROM DoorLogs ORDER BY ID")).recordset.map(row => row.Islem_Tipi);
        assert.deepEqual(logs, [...Array(5).fill('YENİ KAPI'), 'KAT PLANI GÜNCELLENDİ']);
        assert.equal((await call('POST', '/kat-plani/sablon')).status, 409);
    });

    const toBody = current => {
        const katlar = current.katlar.map(floor => ({ id: floor.ID, ref: 'k' + floor.ID, kat_adi: floor.Kat_Adi, sira: floor.Sira }));
        const bolgeler = current.bolgeler.map(area => ({ id: area.ID, ref: 'b' + area.ID, kat: 'k' + area.Kat_ID, bolge_adi: area.Bolge_Adi, bolge_turu: area.Bolge_Turu, noktalar: area.Noktalar, dikey_grup: area.Dikey_Grup }));
        return { katlar, bolgeler };
    };

    await t.test('a save replaces the whole plan, floors included, in one transaction', async () => {
        const current = await plan();
        const { katlar, bolgeler } = toBody(current);
        const keep = bolgeler.filter(area => area.bolge_turu !== 'Diğer');
        keep[0].bolge_adi = 'Giriş Holü';
        const office = keep.find(area => area.bolge_turu === 'Ofis');
        // The office moves to a new upper floor that takes the ground floor's place in the order.
        office.kat = 'ust';
        const body = {
            katlar: [{ ...katlar[0], sira: 1 }, { ref: 'ust', kat_adi: 'Üst Kat', sira: 0 }],
            bolgeler: [...keep,
                { ref: 'yeni', kat: 'ust', bolge_adi: 'Arşiv', bolge_turu: 'Depo', noktalar: [[540, 440], [720, 440], [720, 640], [600, 640], [600, 540], [540, 540]] },
                { ref: 'm', kat: 'ust', bolge_adi: 'Merdiven', bolge_turu: 'Merdiven/Asansör', dikey_grup: 'M1', noktalar: [[0, 0], [100, 0], [100, 100], [0, 100]] }],
            kapilar: [{ id: current.kapilar[1].ID, plan_x: 620, plan_y: 440, bolge_a: office.ref, bolge_b: 'yeni', yon_kisiti: 'A→B' }],
        };
        const saved = await call('PUT', '/kat-plani', body);
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        const after = await plan();
        assert.deepEqual(after.katlar.map(floor => [floor.Kat_Adi, floor.Sira]), [['Üst Kat', 0], ['Zemin Kat', 1]]);
        const upper = after.katlar[0].ID;
        assert.equal(after.bolgeler.length, 6);
        assert.ok(after.bolgeler.some(area => area.Bolge_Adi === 'Giriş Holü'));
        assert.ok(!after.bolgeler.some(area => area.Bolge_Adi === 'Toplantı Odası'));
        assert.equal(after.bolgeler.find(area => area.ID === office.id).Kat_ID, upper);
        const archive = after.bolgeler.find(area => area.Bolge_Adi === 'Arşiv');
        assert.deepEqual([archive.Kat_ID, archive.Noktalar.length], [upper, 6]);
        assert.equal(after.bolgeler.find(area => area.Bolge_Adi === 'Merdiven').Dikey_Grup, 'M1');
        const placed = after.kapilar.filter(door => door.Plan_X !== null);
        assert.equal(placed.length, 1);
        assert.deepEqual([placed[0].ID, placed[0].Bolge_A_ID, placed[0].Bolge_B_ID, placed[0].Yon_Kisiti], [current.kapilar[1].ID, office.id, archive.ID, 'A→B']);
        assert.ok(after.kapilar.filter(door => door.Plan_X === null).every(door => door.Yon_Kisiti === 'Çift'));
        const audit = (await sql.query('SELECT Detay, Islemi_Yapan FROM DoorLogs ORDER BY ID DESC LIMIT 1')).recordset[0];
        assert.deepEqual(audit, { Detay: '2 kat, 6 bölge, 1 yerleşik kapı.', Islemi_Yapan: 'plan-admin' });
        // A removed floor takes its areas with it.
        const { katlar: floors, bolgeler: areas } = toBody(after);
        assert.equal((await call('PUT', '/kat-plani', { katlar: floors.slice(1), bolgeler: areas.filter(area => area.kat !== 'k' + upper), kapilar: [] })).status, 200);
        assert.deepEqual([(await plan()).katlar.length, (await plan()).bolgeler.length], [1, 3]);
    });

    await t.test('invalid plans are rejected without changes', async () => {
        const before = await plan();
        const floor = { ref: 'k', kat_adi: 'Zemin', sira: 0 };
        const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
        const area = { ref: 'a', kat: 'k', bolge_adi: 'A', noktalar: square };
        const door = { id: before.kapilar[0].ID, plan_x: 0, plan_y: 50 };
        const valid = { katlar: [floor], bolgeler: [area], kapilar: [] };
        for (const body of [
            { ...valid, kapilar: [{ ...door, bolge_a: 'yok' }] },
            { ...valid, kapilar: [{ ...door, bolge_a: 'a', bolge_b: 'a' }] },
            { ...valid, kapilar: [{ ...door, bolge_a: 'a', yon_kisiti: 'tek' }] },
            { ...valid, bolgeler: [{ ...area, noktalar: [[0, 0], [100, 100], [100, 0], [0, 100]] }] },
            { ...valid, bolgeler: [{ ...area, noktalar: [[0, 0], [20, 0], [20, 20], [0, 20]] }] },
            { ...valid, bolgeler: [{ ...area, noktalar: [[0, 0], [100, 0]] }] },
            { ...valid, bolgeler: [{ ...area, noktalar: [[0, 0], [2100, 0], [0, 100]] }] },
            { ...valid, bolgeler: [{ ...area, dikey_grup: 'M1' }] },
            { ...valid, bolgeler: [{ ...area, kat: 'yok' }] },
            { ...valid, bolgeler: [area, area] },
            { ...valid, katlar: [floor, { ...floor, ref: 'u' }] },
            { katlar: [floor, { ...floor, ref: 'u', sira: 1 }], bolgeler: [area, { ...area, ref: 'b', kat: 'u' }], kapilar: [{ ...door, bolge_a: 'a', bolge_b: 'b' }] },
            { ...valid, kapilar: [door, door] },
            { ...valid, bolgeler: Array.from({ length: 61 }, (_, i) => ({ ...area, ref: 'r' + i })) },
            { ...valid, katlar: Array.from({ length: 11 }, (_, i) => ({ ...floor, ref: 'k' + i, sira: i })) },
            { bolgeler: [], kapilar: [] },
        ]) assert.equal((await call('PUT', '/kat-plani', body)).status, 400, JSON.stringify(body));
        assert.equal((await call('PUT', '/kat-plani', { ...valid, kapilar: [{ ...door, id: 999999 }] })).status, 404);
        assert.equal((await call('PUT', '/kat-plani', { ...valid, bolgeler: [{ ...area, id: 999999 }] })).status, 404);
        assert.equal((await call('PUT', '/kat-plani', { ...valid, katlar: [{ ...floor, id: 999999 }] })).status, 404);
        assert.deepEqual(await plan(), before);
    });

    await t.test('permitted active personnel are counted per door', async () => {
        const door = (await plan()).kapilar[0].ID;
        await sql.query("INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Durum) VALUES('Aktif','10000000001',true),('Pasif','10000000002',false)");
        await new sql.Request().input('door', sql.Int, door).query('INSERT INTO Permissions(User_ID,Door_ID) SELECT ID,@door FROM Users');
        assert.equal((await plan()).kapilar[0].Yetkili_Sayisi, 2);
    });

    await t.test('outside a simulation the template adds doors without permissions', async () => {
        assert.equal((await call('PUT', '/kat-plani', { katlar: [], bolgeler: [], kapilar: [] })).status, 200);
        await sql.query('UPDATE Doors SET Durum=false');
        const lastDoor = (await sql.query('SELECT MAX(ID) AS n FROM Doors')).recordset[0].n;
        const dbName = process.env.DB_NAME;
        process.env.DB_NAME = 'gksdemo_plan'; // the pool stays on the test database
        try {
            const result = await call('POST', '/kat-plani/sablon');
            assert.equal(result.status, 200, JSON.stringify(result.data));
            assert.equal(result.data.created, 7);
            const refused = await call('POST', '/doors', { kapi_adi: 'Plan Kapısı', yetki_ver: true });
            assert.equal(refused.status, 403);
        } finally { process.env.DB_NAME = dbName; }
        const added = (await plan()).kapilar.filter(door => door.ID > lastDoor);
        assert.equal(added.length, 7);
        assert.ok(added.every(door => door.Yetkili_Sayisi === 0));
    });

    await t.test('a door drawn on the plan is created with its id; a simulation may permit every active person', async () => {
        const plain = await call('POST', '/doors', { kapi_adi: 'Çizilen Kapı', kapi_turu: 'Ana Giriş' });
        assert.equal(plain.status, 200, JSON.stringify(plain.data));
        const granted = await call('POST', '/doors', { kapi_adi: 'Yetkili Kapı', yetki_ver: true });
        assert.ok(Number.isInteger(plain.data.id) && granted.data.id > plain.data.id);
        const doors = (await plan()).kapilar;
        const active = (await sql.query('SELECT COUNT(*) AS n FROM Users WHERE Durum=true')).recordset[0].n;
        assert.deepEqual([doors.find(door => door.ID === plain.data.id).Yetkili_Sayisi, doors.find(door => door.ID === granted.data.id).Yetkili_Sayisi], [0, active]);
        assert.equal((await call('POST', '/doors', { kapi_adi: 'Yetkisiz', yetki_ver: true }, viewer)).status, 403);
    });

    await t.test('the factory template builds two floors joined by a staircase', async () => {
        assert.equal((await call('POST', '/kat-plani/sablon', { sablon: 'yok' })).status, 400);
        assert.equal((await call('PUT', '/kat-plani', { katlar: [], bolgeler: [], kapilar: [] })).status, 200);
        const result = await call('POST', '/kat-plani/sablon', { sablon: 'fabrika' });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.match(result.data.message, /^Fabrika şablonu/);
        const current = await plan();
        assert.deepEqual(current.katlar.map(floor => floor.Kat_Adi), ['Zemin Kat', '1. Kat']);
        const stairs = current.bolgeler.filter(area => area.Dikey_Grup === 'Merdiven');
        assert.deepEqual(new Set(stairs.map(area => area.Kat_ID)).size, 2);
        const cafeteria = current.bolgeler.find(area => area.Bolge_Turu === 'Yemekhane').ID;
        const into = current.kapilar.filter(door => door.Kapi_Turu === 'Yemekhane Giriş' && door.Bolge_B_ID === cafeteria);
        assert.equal(into.length, 2, 'two entrances into the cafeteria');
        assert.notEqual(into[0].Bolge_A_ID, into[1].Bolge_A_ID);
        const floorOf = new Map(current.bolgeler.map(area => [area.ID, area.Kat_ID]));
        assert.ok(current.kapilar.filter(door => door.Bolge_A_ID && door.Bolge_B_ID).every(door => floorOf.get(door.Bolge_A_ID) === floorOf.get(door.Bolge_B_ID)));
        assert.equal(current.kapilar.filter(door => door.Plan_X !== null).length, 12, 'every slot is filled');
    });
});
