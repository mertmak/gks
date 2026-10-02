const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');

test('authenticated live notifications follow committed writes and omit rolled-back writes', { skip: process.env.RUN_DB_TESTS !== 'true', timeout: 120000 }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    process.env.ENABLE_SETUP = 'true';
    const server = require('http').createServer(require('../server').app);
    const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));
    const root = `http://127.0.0.1:${server.address().port}`;
    let token;
    const call = async (path, body) => {
        const response = await fetch(root + '/api' + path, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body)
        });
        return { status: response.status, data: await response.json() };
    };
    const credentials = { username: 'socket-admin', password: 'Fixture-Socket-Password-123' };
    assert.equal((await call('/ilk-kurulum', credentials)).status, 200);
    token = (await call('/login', credentials)).data.token;
    assert.ok(token);
    assert.equal((await call('/hesap-ekle', { ...credentials, username: 'socket-viewer', rol: 'user' })).status, 200);
    const viewerToken = (await call('/login', { ...credentials, username: 'socket-viewer' })).data.token;
    const client = connect(root, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token: viewerToken } });
    t.after(() => client.close());
    const connected = once(client, 'connect', { signal: AbortSignal.timeout(5000) });
    client.connect();
    await connected;
    const notifications = [];
    client.onAny(event => notifications.push(event));
    // Ordered barrier on the same socket proves all earlier packets were delivered.
    const barrier = async () => {
        const delivered = once(client, 'fixture_barrier', { signal: AbortSignal.timeout(5000) });
        io.emit('fixture_barrier');
        await delivered;
    };
    const door = { kapi_adi: 'Socket Fixture Door', kapi_turu: 'İç Geçiş' };
    await sql.query("CREATE TRIGGER Fixture_Door_Audit_Reject ON DoorLogs INSTEAD OF INSERT AS THROW 51000, 'fixture audit failure', 1;");
    assert.equal((await call('/doors', door)).status, 500);
    await barrier();
    assert.deepEqual(notifications.filter(event => event !== 'fixture_barrier'), []);
    assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Doors')).recordset[0].n, 0);
    await sql.query('DROP TRIGGER Fixture_Door_Audit_Reject');
    const doorSeen = once(client, 'new_door_log', { signal: AbortSignal.timeout(5000) }).then(() => sql.query('SELECT (SELECT COUNT(*) FROM Doors) AS doors, (SELECT COUNT(*) FROM DoorLogs) AS logs'));
    assert.equal((await call('/doors', door)).status, 200);
    assert.deepEqual((await doorSeen).recordset[0], { doors: 1, logs: 1 });
    await barrier();
    for (const event of ['new_door_log', 'doors_updated', 'system_updated']) assert.equal(notifications.filter(value => value === event).length, 1, event);

    // A real reconnect must authenticate again against the current account version.
    client.disconnect();
    await sql.query("UPDATE Yoneticiler SET Token_Version=Token_Version+1 WHERE Kullanici_Adi='socket-viewer'");
    const revoked = once(client, 'connect_error', { signal: AbortSignal.timeout(5000) });
    client.connect();
    assert.match((await revoked)[0].message, /Oturum geçersiz/);
    assert.equal(client.connected, false);
    const anonymous = connect(root, { autoConnect: false, reconnection: false, transports: ['websocket'] });
    t.after(() => anonymous.close());
    const rejected = once(anonymous, 'connect_error', { signal: AbortSignal.timeout(5000) });
    anonymous.connect();
    assert.match((await rejected)[0].message, /Oturum geçersiz/);
});
