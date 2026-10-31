const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('personal simulation copies are writable, isolated and expire', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    process.env.DEMO_MODE = 'true'; process.env.SANDBOX_MODE = 'true'; process.env.SANDBOX_MAX = '2';
    process.env.DEMO_SEED_CONFIRM = process.env.DB_NAME;
    const { sql, connectDB } = require('../db');
    await connectDB();
    await require('../services/demoSeed').seedDemo();
    const sandbox = require('../services/sandbox');
    const { runInSchema } = require('../db/context');
    const { app } = require('../server');
    const server = require('http').createServer(app);
    const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));
    const root = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, endpoint, token, body) => {
        const r = await fetch(root + '/api' + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, data: await r.json() };
    };
    const count = async (table, schema) => {
        const read = () => sql.query(`SELECT COUNT(*) AS n FROM ${table}`);
        return (await (schema ? runInSchema(schema, read) : read())).recordset[0].n;
    };
    const schemaExists = async schema => (await new sql.Request().input('name', sql.VarChar, schema)
        .query('SELECT COUNT(*) AS n FROM pg_namespace WHERE nspname=@name')).recordset[0].n === 1;
    const schemaOf = token => jwt.decode(token).sandbox;

    assert.equal(await count('Bolgeler'), 5, 'the demo seed draws the plan the copies start from');
    assert.equal((await call('GET', '/public-config')).data.sandbox, true);
    const first = await call('POST', '/sandbox');
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const second = await call('POST', '/sandbox');
    assert.equal(second.status, 200);
    const a = first.data.token, b = second.data.token;
    assert.notEqual(schemaOf(a), schemaOf(b));
    assert.equal((await call('POST', '/sandbox')).status, 503, 'SANDBOX_MAX is enforced');

    await t.test('a copy starts from the demo data, keeps log owners and reports the same attendance', async () => {
        for (const table of sandbox.copied) assert.equal(await count(table, schemaOf(a)), await count(table), table);
        for (const query of ['SELECT ID, User_ID FROM Logs ORDER BY ID', 'SELECT ID, Plan_X, Plan_Y, Bolge_A_ID, Bolge_B_ID FROM Doors ORDER BY ID']) {
            assert.deepEqual((await runInSchema(schemaOf(a), () => sql.query(query))).recordset, (await sql.query(query)).recordset);
        }
        assert.equal(await count('Bolgeler', schemaOf(a)), 5);
        assert.equal(await count('Katlar', schemaOf(a)), 1);
        const viewer = (await call('POST', '/demo-login')).data.token;
        const expected = (await call('GET', '/reports/daily-attendance?tarih=2026-09-07', viewer)).data;
        assert.deepEqual((await call('GET', '/reports/daily-attendance?tarih=2026-09-07', a)).data, expected);
        assert.equal(expected.length, 12);
    });

    await t.test('writes stay inside the visitor copy; the read-only demo is unchanged', async () => {
        const person = { ad_soyad: 'Simülasyon Kişisi', tc: '66000000001', sicil: '60001', rfid: '55000000001', ise_giris: '2026-09-01' };
        const created = await call('POST', '/users', a, person);
        assert.equal(created.status, 200, JSON.stringify(created.data));
        assert.equal(await count('Users', schemaOf(a)), 13);
        assert.equal(await count('Users', schemaOf(b)), 12);
        assert.equal(await count('Users'), 12);
        const audit = (await runInSchema(schemaOf(a), () => sql.query("SELECT Islemi_Yapan FROM SystemLogs ORDER BY ID DESC LIMIT 1"))).recordset[0];
        assert.equal(audit.Islemi_Yapan, 'Simülasyon Ziyaretçisi');
        const viewer = (await call('POST', '/demo-login')).data.token;
        const denied = await call('POST', '/users', viewer, person);
        assert.equal(denied.status, 403);
        assert.equal(denied.data.code, 'DEMO_READ_ONLY');
        const forged = jwt.sign({ sandbox: 'sbx_0000000000000000', role: 'admin' }, process.env.JWT_SECRET);
        assert.equal((await call('POST', '/users', forged, person)).status, 401);
    });

    await t.test('panel accounts cannot be managed from a copy', async () => {
        for (const [method, endpoint] of [['GET', '/hesaplar'], ['POST', '/hesap-ekle'], ['POST', '/sifre-degistir'], ['DELETE', '/hesap-sil/1']]) {
            const result = await call(method, endpoint, a, method === 'GET' ? undefined : {});
            assert.equal(result.status, 403, endpoint);
            assert.equal(result.data.code, 'SANDBOX_FORBIDDEN');
        }
        assert.equal((await call('GET', '/features', a)).data.simulation, true);
    });

    await t.test('the bulk generator writes only to the copy and has smaller limits', async () => {
        const shift = (await call('GET', '/shifts', a)).data[0].ID;
        const body = { userAction: 'append', doorAction: 'keep', logAction: 'append', personelSayisi: 5, kapiSayisi: 1, vardiyaId: shift, startDateStr: '2026-09-08', endDateStr: '2026-09-09' };
        const before = await count('Logs');
        const result = await call('POST', '/seeder/run', a, body);
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.equal(await count('Users', schemaOf(a)), 18);
        assert.ok(await count('Logs', schemaOf(a)) > before);
        assert.equal(await count('Logs'), before);
        assert.equal((await call('POST', '/seeder/run', a, { ...body, personelSayisi: 60 })).status, 400);
        assert.equal((await call('POST', '/seeder/run', a, { ...body, endDateStr: '2026-09-30' })).status, 400);
    });

    await t.test('the floor plan is edited per copy', async () => {
        const katlar = [{ ref: 'k', kat_adi: 'Zemin', sira: 0 }, { ref: 'u', kat_adi: 'Üst', sira: 1 }];
        const area = { ref: 'x', kat: 'k', bolge_adi: 'Simülasyon Ofisi', bolge_turu: 'Ofis', noktalar: [[240, 40], [640, 40], [640, 340], [240, 340]] };
        const saved = await call('PUT', '/kat-plani', a, { katlar, bolgeler: [area, { ...area, ref: 'y', kat: 'u' }], kapilar: [] });
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        assert.equal(await count('Bolgeler', schemaOf(a)), 2);
        assert.equal(await count('Bolgeler', schemaOf(b)), 5);
        assert.equal(await count('Bolgeler'), 5);
        assert.deepEqual([await count('Katlar', schemaOf(a)), await count('Katlar', schemaOf(b)), await count('Katlar')], [2, 1, 1]);
        const viewer = (await call('POST', '/demo-login')).data.token;
        assert.equal((await call('PUT', '/kat-plani', viewer, { katlar: [], bolgeler: [], kapilar: [] })).status, 403);
        assert.equal((await call('GET', '/kat-plani', viewer)).data.bolgeler.length, 5);
    });

    await t.test('socket events reach only the copy that changed', async () => {
        const { io: connect } = require('socket.io-client');
        const listen = token => new Promise((resolve, reject) => {
            const client = connect(root, { auth: { token }, transports: ['websocket'] });
            client.once('connect', () => resolve(client));
            client.once('connect_error', reject);
        });
        const [clientA, clientB] = await Promise.all([listen(a), listen(b)]);
        try {
            const seen = { a: 0, b: 0 };
            clientA.on('doors_updated', () => seen.a++);
            clientB.on('doors_updated', () => seen.b++);
            assert.equal((await call('POST', '/doors', a, { kapi_adi: 'Simülasyon Kapısı', kapi_turu: 'İç Geçiş' })).status, 200);
            await new Promise(resolve => setTimeout(resolve, 300));
            assert.deepEqual(seen, { a: 1, b: 0 });
        } finally { clientA.close(); clientB.close(); }
    });

    await t.test('row quotas reject further inserts with 409', async () => {
        const doors = await count('Doors', schemaOf(a));
        await runInSchema(schemaOf(a), () => sql.query(`INSERT INTO Doors(Kapi_Adi) SELECT 'Kota ' || g FROM generate_series(1, ${sandbox.quotas.Doors - doors}) g`));
        const result = await call('POST', '/doors', a, { kapi_adi: 'Fazla Kapı', kapi_turu: 'İç Geçiş' });
        assert.equal(result.status, 409);
        assert.equal(result.data.code, 'SANDBOX_QUOTA');
        assert.equal(await count('Doors', schemaOf(a)), sandbox.quotas.Doors);
    });

    await t.test('expired copies are refused and purged; closing and resetting drop the schema', async () => {
        await new sql.Request().input('name', sql.VarChar, schemaOf(a))
            .query("UPDATE GksSandboxes SET Bitis = LOCALTIMESTAMP - interval '1 minute' WHERE Schema_Adi=@name");
        const expired = await call('GET', '/users', a);
        assert.equal(expired.status, 401);
        assert.equal(expired.data.code, 'SANDBOX_EXPIRED');
        assert.equal(await sandbox.purge(), 1);
        assert.equal(await schemaExists(schemaOf(a)), false);
        assert.equal((await call('DELETE', '/sandbox', b)).status, 200);
        assert.equal(await schemaExists(schemaOf(b)), false);
        assert.equal((await call('GET', '/users', b)).status, 401);
        const c = (await call('POST', '/sandbox')).data.token;
        const reset = await call('POST', '/sandbox/reset', c);
        assert.equal(reset.status, 200);
        assert.equal(await schemaExists(schemaOf(c)), false);
        assert.equal(await count('Users', schemaOf(reset.data.token)), 12);
        assert.equal(await sandbox.purge(), 0, 'a restart keeps open copies of the current version');
        await sql.query(`COMMENT ON SCHEMA ${schemaOf(reset.data.token)} IS '000_eski.sql'`);
        assert.equal(await sandbox.purge(), 1, 'copies built by older migrations are dropped');
        assert.equal((await sql.query("SELECT COUNT(*) AS n FROM pg_namespace WHERE nspname LIKE 'sbx\\_%'")).recordset[0].n, 0);
        assert.equal(await count('GksSandboxes'), 0);
    });
});
