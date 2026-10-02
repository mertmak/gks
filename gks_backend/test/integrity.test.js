const test = require('node:test');
const assert = require('node:assert/strict');

test('fresh setup and administrative integrity', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    process.env.ENABLE_SETUP = 'true';
    const { app } = require('../server');
    const server = require('http').createServer(app);
    const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));
    const root = `http://127.0.0.1:${server.address().port}/api`;
    let token;
    const call = async (method, path, body) => {
        const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
    };
    const password = 'Fixture-Setup-Password-123';
    await t.test('concurrent first setup creates exactly one administrator', async () => {
        const results = await Promise.all(['first-a', 'first-b'].map(username => call('POST', '/ilk-kurulum', { username, password })));
        assert.deepEqual(results.map(r => r.status).sort(), [200, 403]);
        const accounts = (await sql.query('SELECT * FROM Yoneticiler')).recordset;
        assert.equal(accounts.length, 1);
        token = (await call('POST', '/login', { username: accounts[0].Kullanici_Adi, password })).data.token;
        assert.ok(token);
    });
    await t.test('concurrent duplicate account has one controlled rejection', async () => {
        const results = await Promise.all([1, 2].map(() => call('POST', '/hesap-ekle', { username: 'duplicate', password, rol: 'user' })));
        assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    });
    await call('POST', '/users', { ad_soyad: 'Fixture Leave', tc: '99000000001', sicil: '90001', rfid: '88000000001', ise_giris: '2026-01-01' });
    const uid = (await sql.query("SELECT ID FROM Users WHERE Sicil_No='90001'")).recordset[0].ID;
    const body = { user_id: uid, izin_turu: 'Yıllık İzin', baslangic: '2026-09-07', bitis: '2026-09-09', aciklama: 'Fixture' };
    await t.test('overlap is inclusive and concurrent requests cannot both reserve days', async () => {
        const results = await Promise.all([1, 2].map(() => call('POST', '/leaves', body)));
        assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
        assert.equal((await call('POST', '/leaves', { ...body, baslangic: '2026-09-09', bitis: '2026-09-10', durum: 'Bekliyor' })).status, 409);
        assert.equal((await call('POST', '/leaves', { ...body, baslangic: '2026-09-10', bitis: '2026-09-10', durum: 'Bekliyor' })).status, 200);
        assert.equal((await call('POST', '/leaves', { ...body, durum: 'Reddedildi' })).status, 200);
        assert.equal((await call('POST', '/leaves', { ...body, user_id: 2147483647 })).status, 404);
    });
    await t.test('legacy overlapping approvals are flagged and block atomic overtime decisions until corrected', async () => {
        const inserted = await new sql.Request().input('uid', sql.Int, uid).query(`
          INSERT INTO Izinler(User_ID,Izin_Turu,Baslangic_Tarihi,Bitis_Tarihi,Durum)
          OUTPUT INSERTED.ID VALUES(@uid,N'Raporlu','2026-09-08','2026-09-09',N'Onaylandı')`);
        const conflictId = inserted.recordset[0].ID;
        const report = await call('GET', '/reports/daily-attendance?tarih=2026-09-09');
        assert.equal(report.status, 200);
        const row = report.data.find(row => row.User_ID === uid);
        assert.equal(row.Durum, 'İzin Çakışması');
        assert.equal(row.Izin_Cakismasi, true);
        assert.equal(row.Onayli_Izin_Sayisi, 2);
        assert.equal(row.Izin_Durumu, null);
        assert.equal(row.Hesaplanan_Dk, 0);
        const overtime = await call('GET', '/overtimes?baslangic=2026-09-09&bitis=2026-09-09');
        assert.equal(overtime.data.find(row => row.User_ID === uid).Izin_Cakismasi, true);
        const leaves = (await call('GET', '/leaves')).data;
        assert.equal(leaves.filter(row => row.Cakisma_Var).length, 2);
        assert.equal(leaves.find(row => row.Durum === 'Reddedildi').Cakisma_Var, false);
        const decision = { user_id: uid, tarih: '2026-09-09', onaylanan_dk: 0, durum: 'Onaylandı' };
        assert.equal((await call('POST', '/overtimes/approve', decision)).status, 409);
        assert.equal((await call('POST', '/overtimes/approve-bulk', { mesailer: [{ ...decision, tarih: '2026-09-07' }, decision], durum: 'Onaylandı' })).status, 409);
        assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Mesai_Onaylari')).recordset[0].n, 0);
        assert.equal((await sql.query("SELECT COUNT(*) AS n FROM SystemLogs WHERE Islem_Tipi=N'MESAİ KARARI'")).recordset[0].n, 0);
        assert.equal((await call('DELETE', `/leaves/${conflictId}`)).status, 200);
        const corrected = (await call('GET', '/reports/daily-attendance?tarih=2026-09-09')).data.find(row => row.User_ID === uid);
        assert.equal(corrected.Durum, 'Yıllık İzin');
        assert.equal(corrected.Izin_Cakismasi, false);
        assert.equal(corrected.Onayli_Izin_Sayisi, 1);
        assert.equal((await call('POST', '/overtimes/approve', decision)).status, 200);
        assert.ok((await call('GET', '/leaves')).data.every(row => !row.Cakisma_Var));
    });
    await t.test('missing rows and malformed IDs do not return success', async () => {
        const shift = { vardiya_adi: 'Fixture', mesai_baslangic: '09:00', mesai_bitis: '18:00' };
        const cases = [['DELETE', '/leaves', undefined], ['DELETE', '/hesap-sil', undefined], ['PUT', '/doors', { kapi_adi: 'Fixture' }], ['PATCH', '/doors', { durum: 0 }, '/status'], ['PUT', '/shifts', shift], ['PATCH', '/shifts', { durum: 0 }, '/status']];
        for (const [method, path, payload, suffix = ''] of cases) {
            assert.equal((await call(method, `${path}/2147483647${suffix}`, payload)).status, 404, path);
            assert.equal((await call(method, `${path}/1junk${suffix}`, payload)).status, 400, path);
        }
        for (const suffix of ['doors', 'shift']) {
            assert.equal((await call('GET', `/users/2147483647/${suffix}`)).status, 404);
            assert.equal((await call('GET', `/users/1junk/${suffix}`)).status, 400);
        }
        assert.deepEqual((await call('GET', `/users/${uid}/doors`)).data, []);
        assert.deepEqual((await call('GET', `/users/${uid}/shift`)).data, { vardiya_id: '' });
    });
    await t.test('query bounds and last millisecond are handled consistently', async () => {
        for (const path of ['/users', '/logs', '/door-logs', '/system-logs']) {
            for (const query of ['page=0', 'page=1x', 'limit=501', 'page=1&page=2', 'arama='+ 'x'.repeat(101)]) {
                assert.equal((await call('GET', `${path}?${query}`)).status, 400, path + query);
            }
        }
        for (const path of ['/logs', '/door-logs', '/system-logs']) {
            assert.equal((await call('GET', `${path}?baslangic=2026-02-30`)).status, 400);
            assert.equal((await call('GET', `${path}?baslangic=2026-09-02&bitis=2026-09-01`)).status, 400);
        }
        await sql.query("INSERT INTO DoorLogs(Islem_Tipi,Kapi_Adi,Tarih) VALUES(N'Fixture',N'Fixture','2026-09-07T23:59:59.997'),(N'Fixture',N'Fixture','2026-09-08T00:00:00')");
        const result = await call('GET', '/door-logs?baslangic=2026-09-07&bitis=2026-09-07');
        assert.equal(result.status, 200);assert.equal(result.data.pagination.total, 1);
        assert.equal((await call('GET', '/users?arama=88000000001')).data.data[0].ID, uid);
    });
    await t.test('audit failure rolls back leave insertion and deletion', async () => {
        const before = (await sql.query('SELECT * FROM Izinler')).recordset;
        await sql.query("CREATE TRIGGER Fixture_Audit_Failure ON SystemLogs INSTEAD OF INSERT AS THROW 51000, 'Fixture audit failure', 1;");
        try {
            assert.equal((await call('POST', '/leaves', { ...body, baslangic: '2026-09-20', bitis: '2026-09-20' })).status, 500);
            assert.equal((await call('DELETE', `/leaves/${before[0].ID}`)).status, 500);
            assert.deepEqual((await sql.query('SELECT * FROM Izinler')).recordset, before);
            assert.equal((await call('POST', '/shifts', { vardiya_adi: 'Fixture', mesai_baslangic: '09:00', mesai_bitis: '18:00' })).status, 500);
            assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Vardiyalar')).recordset[0].n, 0);
        } finally { await sql.query('DROP TRIGGER Fixture_Audit_Failure'); }
        assert.equal((await call('DELETE', `/leaves/${before[0].ID}`)).status, 200);
        assert.equal((await call('DELETE', `/leaves/${before[0].ID}`)).status, 404);
    });
    await t.test('report queries reject malformed dates and dashboard filters before SQL', async () => {
        for (const value of ['', '2026-02-30', '0000-01-01', '1753-01-01', '9999-12-31', '2026-09-07&tarih=2026-09-08']) {
            const result = await call('GET', '/reports/daily-attendance?tarih=' + value);
            assert.equal(result.status, 400, value);
            assert.equal(result.data.success, false);
            assert.doesNotMatch(result.data.message, /SELECT|mssql|RequestError/);
        }
        for (const query of ['', 'baslangic=2026-09-07', 'baslangic=2026-09-08&bitis=2026-09-07', 'baslangic=2024-01-01&bitis=2025-01-01', 'baslangic=2026-09-07&baslangic=2026-09-08&bitis=2026-09-09']) {
            assert.equal((await call('GET', '/overtimes?' + query)).status, 400, query);
        }
        for (const query of ['filter=invalid', 'filter=', 'filter=gunluk&filter=aylik']) assert.equal((await call('GET', '/dashboard/summary?' + query)).status, 400, query);
        assert.equal((await call('GET', '/dashboard/summary')).status, 200);
        // Exercise the accepted SQL boundaries, not only the schema parser.
        for (const value of ['1753-01-02', '9999-12-29']) {
            assert.equal((await call('GET', '/reports/daily-attendance?tarih=' + value)).status, 200, value);
            assert.equal((await call('GET', `/logs?baslangic=${value}&bitis=${value}`)).status, 200, value);
        }
    });
});
