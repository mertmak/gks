const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const withEnv = (values, work) => {
    const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    Object.assign(process.env, values);
    try { return work(); } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
};

test('üretimde veritabanı bağlantısı TLS ve sertifika doğrulaması olmadan kurulamaz', t => {
    const { connectionConfig } = require('../db');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gks-ca-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ca = path.join(dir, 'ca.crt');
    fs.writeFileSync(ca, 'fixture-ca');
    const production = withEnv({ NODE_ENV: 'production', DB_SSL: 'false', DB_SSL_REJECT_UNAUTHORIZED: 'false', DB_SSL_CA: ca },
        () => connectionConfig('gksdb').ssl);
    assert.deepEqual(production, { rejectUnauthorized: true, ca: 'fixture-ca' });
    const development = withEnv({ NODE_ENV: 'development', DB_SSL: 'false', DB_SSL_CA: ca }, () => connectionConfig('gksdb').ssl);
    assert.equal(development, false);
    const optional = withEnv({ NODE_ENV: 'development', DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false', DB_SSL_CA: '' },
        () => connectionConfig('gksdb').ssl);
    assert.deepEqual(optional, { rejectUnauthorized: false });
});

test('üretimde kısa JWT_SECRET reddedilir', () => {
    process.env.JWT_SECRET ||= randomUUID() + randomUUID();
    const { assertProductionConfig } = require('../server');
    withEnv({ JWT_SECRET: 'x'.repeat(31) }, () => assert.throws(assertProductionConfig, /en az 32/));
    withEnv({ JWT_SECRET: 'x'.repeat(32) }, () => assert.doesNotThrow(assertProductionConfig));
});

test('üretim DB koruması süper kullanıcıyı ve varsayılan yönetici şifresini reddeder; uygulama hesabı API için yeterlidir', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    const { app, assertProductionDatabase } = require('../server');
    const bcrypt = require('bcrypt');
    const suffix = process.env.DB_NAME.slice(-12);
    const role = `gksprod_${suffix}`;
    const user = `gksprod_user_${suffix}`;
    const password = randomUUID();
    const installer = { DB_USER: process.env.DB_USER, DB_PASSWORD: process.env.DB_PASSWORD };
    process.env.RUNTIME_DB_ROLE = role;
    await connectDB();
    const adminPassword = 'Fixture-Admin-Password-123';
    await new sql.Request().input('hash', sql.VarChar, await bcrypt.hash(adminPassword, 10))
        .query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('fixture-admin',@hash,'admin')");
    await assert.rejects(assertProductionDatabase(), /süper kullanıcı/);
    await sql.query(`CREATE ROLE ${user} LOGIN PASSWORD '${password}'`);
    const reconnect = async credentials => { await sql.close(); Object.assign(process.env, credentials); await connectDB(); };
    try {
        await require('../services/runtimeRole').configureRuntimeRole(user);
        await reconnect({ DB_USER: user, DB_PASSWORD: password });
        await assertProductionDatabase();
        const server = require('node:http').createServer(app);
        const io = require('../utils/socket').init(server);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const root = `http://127.0.0.1:${server.address().port}/api`;
            const call = async (method, route, body, token) => {
                const response = await fetch(root + route, { method,
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: body === undefined ? undefined : JSON.stringify(body) });
                return { status: response.status, data: await response.json() };
            };
            const login = await call('POST', '/login', { username: 'fixture-admin', password: adminPassword });
            assert.equal(login.status, 200);
            const door = await call('POST', '/doors', { kapi_adi: 'Runtime Door', kapi_turu: 'İç Geçiş' }, login.data.token);
            assert.equal(door.status, 200, JSON.stringify(door.data));
            assert.equal((await call('GET', '/doors', undefined, login.data.token)).data.length, 1);
            assert.equal((await call('GET', '/system-logs?limit=5', undefined, login.data.token)).status, 200);
        } finally { await new Promise(resolve => io.close(resolve)); }
        await new sql.Request().input('hash', sql.VarChar, await bcrypt.hash('admin', 10))
            .query("UPDATE Yoneticiler SET Sifre_Hash=@hash WHERE Kullanici_Adi='fixture-admin'");
        await assert.rejects(assertProductionDatabase(), /varsayılan yönetici/);
    } finally {
        await reconnect(installer);
        await sql.query(`DROP OWNED BY ${user}; DROP ROLE ${user}`);
        const exists = await new sql.Request().input('role', sql.NVarChar, role).query('SELECT 1 AS n FROM pg_roles WHERE rolname=@role');
        if (exists.recordset.length) await sql.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
    }
});
