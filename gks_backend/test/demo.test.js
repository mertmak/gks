const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('demo denies every business mutation even with an admin token', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    process.env.DEMO_MODE = 'true';process.env.ENABLE_SETUP = 'true';process.env.ENABLE_SIMULATION = 'true';
    const { sql, connectDB } = require('../db');await connectDB();
    const {seedDemo}=require('../services/demoSeed');
    await assert.rejects(seedDemo(),/DEMO_SEED_CONFIRM/);
    process.env.DEMO_SEED_CONFIRM=process.env.DB_NAME;
    await t.test('CLI bootstrap followed by seed preserves setup audit and rejects other history', async () => {
        require('node:child_process').execFileSync(process.execPath, ['scripts/create-admin.js'], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env, BOOTSTRAP_USERNAME: 'fixture-admin', BOOTSTRAP_PASSWORD: 'Test-Only-Bootstrap-2026!' },
            stdio: 'pipe',
        });
        const setup = (await sql.query('SELECT * FROM SystemLogs')).recordset;
        assert.equal(setup.length, 1);
        assert.equal(setup[0].Islem_Tipi, 'İLK KURULUM');
        const foreign = (await sql.query("INSERT INTO SystemLogs(Islem_Tipi,Islemi_Yapan,Personel_Ad,Detay) VALUES('PERSONEL','Test','Test Personel','Existing history') RETURNING ID")).recordset[0].ID;
        await assert.rejects(seedDemo(), /boş iş tabloları/);
        assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Users')).recordset[0].n, 0);
        assert.equal((await sql.query('SELECT COUNT(*) AS n FROM SystemLogs')).recordset[0].n, 2);
        await new sql.Request().input('id', sql.Int, foreign).query('DELETE FROM SystemLogs WHERE ID=@id');
        assert.equal((await seedDemo()).alreadySeeded, false);
        const preserved = (await new sql.Request().input('id', sql.Int, setup[0].ID).query('SELECT * FROM SystemLogs WHERE ID=@id')).recordset;
        assert.deepEqual(preserved, setup);
    });
    assert.equal((await seedDemo()).alreadySeeded,true);
    assert.equal((await sql.query('SELECT COUNT(*) AS n FROM Users')).recordset[0].n,12);
    const report=await require('../services/attendance').attendance('2026-09-07','2026-09-07');
    const row=n=>report.find(r=>r.Sicil_No===String(10000+n));
    assert.equal(row(1).Durum,'Normal');assert.equal(row(2).Hesaplanan_Dk,30);
    assert.equal(row(3).Gec_Kalma_Dk,0);assert.equal(row(4).Gec_Kalma_Dk,11);
    assert.equal(row(5).Erken_Cikma_Dk,30);assert.equal(row(6).Durum,'Çıkış Yok');
    assert.equal(row(7).Durum,'Devamsız');assert.equal(row(8).Durum,'Yıllık İzin');
    assert.equal(row(10).Mola_Asimi_Dk,15);assert.equal(row(10).Fazla_Mesai_Dk,60);
    assert.equal(row(11).Fazla_Mesai_Dk,0);assert.equal(row(11).Mesai_Durumu,'Onaylandı');
    assert.equal(row(12).Mesai_Durumu,'Reddedildi');
    const holiday=(await require('../services/attendance').attendance('2026-09-06','2026-09-06')).find(r=>r.Sicil_No==='10009');
    assert.equal(holiday.Hesaplanan_Dk,460);
    const { app } = require('../server');
    const server = require('http').createServer(app);const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));
    const root = `http://127.0.0.1:${server.address().port}/api`;
    const call = async(method, endpoint, token) => {
        const r = await fetch(root + endpoint, {method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:['GET','HEAD'].includes(method)?undefined:JSON.stringify({DEMO_MODE:false,role:'admin'})});
        return {status:r.status,data:await r.json()};
    };
    const login = await call('POST','/demo-login');assert.equal(login.status,200);
    const viewer = login.data.token;
    await t.test('weekly demo labels retain business dates on a western-timezone host', async () => {
        const previousTZ = process.env.TZ;
        try {
            process.env.TZ = 'America/Los_Angeles';
            const weekly = await call('GET', '/dashboard/summary?filter=haftalik', viewer);
            assert.equal(weekly.status, 200);
            assert.deepEqual(weekly.data.trendData.map(row => row.label), ['Paz', 'Pzt']);
        } finally {
            if (previousTZ === undefined) delete process.env.TZ;
            else process.env.TZ = previousTZ;
        }
    });
    const account = (await sql.query("SELECT * FROM Yoneticiler WHERE Rol='admin'")).recordset[0];
    const admin = require('jsonwebtoken').sign({id:account.ID,role:'admin',version:0},process.env.JWT_SECRET);
    const snapshot = async () => {
        const result = {};
        for(const table of ['Users','Doors','Permissions','Logs','Personel_Vardiya','Personel_Calisma_Gecmisi','Vardiyalar','Izinler','Mesai_Onaylari','Yoneticiler','SystemLogs','DoorLogs']) result[table]=(await sql.query(`SELECT * FROM ${table} ORDER BY ID`)).recordset;
        return result;
    };
    const before=await snapshot();
    const mutations=[];
    for(const file of fs.readdirSync(path.join(__dirname,'../routes'))) {
        const source=fs.readFileSync(path.join(__dirname,'../routes',file),'utf8');
        for(const [,method,route] of source.matchAll(/router\.(post|put|patch|delete)\(['"]([^'"]+)['"]/g)) {
            if(['/login','/demo-login'].includes(route))continue;
            mutations.push([method.toUpperCase(),route.replace(/:id/g,'1')]);
        }
    }
    assert.ok(mutations.length>=20);
    for(const [method,route] of mutations) for(const token of [viewer,admin]) {
        const result=await call(method,route,token);assert.equal(result.status,403,`${method} ${route}`);assert.equal(result.data.code,'DEMO_READ_ONLY');
    }
    assert.deepEqual(await snapshot(),before);
    assert.equal((await call('GET','/users')).status,401);
    assert.equal((await call('GET','/users',viewer)).status,200);
    assert.equal((await call('GET','/public-config')).data.referenceDate,'2026-09-07');
    assert.equal((await call('GET','/public-config')).data.businessTimeZone,process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul');
    assert.equal((await call('GET','/features',viewer)).data.simulation,false);
    assert.equal(require('../utils/attendance').businessToday(),'2026-09-07');
    t.diagnostic(`${mutations.length} write routes checked with both viewer and admin tokens; data unchanged.`);
});
