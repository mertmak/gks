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
    assert.deepEqual(await seedDemo(),{alreadySeeded:true});
    const count=async query=>(await sql.query(query)).recordset[0].n;
    assert.equal(await count('SELECT COUNT(*) AS n FROM Bolgeler'),9);
    assert.equal(await count('SELECT COUNT(*) AS n FROM Doors WHERE Plan_X IS NOT NULL'),12,'every demo door is on the factory plan');
    assert.equal(await count('SELECT COUNT(*) AS n FROM Users'),119);
    assert.equal(await count('SELECT COUNT(*) AS n FROM Users WHERE Durum'),110);
    assert.equal(await count('SELECT COUNT(DISTINCT L.RFID_Kart_No) AS n FROM Logs L JOIN Users U ON U.ID=L.User_ID WHERE L.RFID_Kart_No<>U.RFID_Kart_No'),2,'passes made with a replaced card keep their owner');
    assert.equal(await count('SELECT COUNT(*) AS n FROM Personel_Calisma_Gecmisi'),1);
    // The whole year reads as a working factory: no rows the calendar cannot explain.
    const year=await require('../services/attendance').attendance('2025-11-01','2026-10-30');
    const statuses=new Set(year.map(row=>row.Durum));
    for(const status of ['Normal','Geç Kaldı','Erken Çıktı','Devamsız','Çıkış Yok','Mola Aşımı','Hafta Tatili','Tatil Mesaisi','Yıllık İzin','Raporlu','Mazeret İzni','Resmi Tatil']) assert.ok(statuses.has(status),status);
    for(const status of ['Giriş Yok','Vardiya Yok','İzin Çakışması','Tatil Mesaisi / Çıkış Yok']) assert.ok(!statuses.has(status),status);
    const pending=year.filter(row=>row.Hesaplanan_Dk>0&&row.Mesai_Durumu==='Bekliyor');
    assert.ok(pending.length>0&&pending.every(row=>row.TarihStr>'2026-10-23'),'only the last week waits for an overtime decision');
    assert.equal(year.filter(row=>row.Hesaplanan_Dk>0&&row.Mesai_Durumu!=='Bekliyor').length,await count('SELECT COUNT(*) AS n FROM Mesai_Onaylari'));
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
            assert.deepEqual([weekly.data.trendData[0].label, weekly.data.trendData.at(-1).label], ['Cmt', 'Cum']);
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
    assert.equal((await call('GET','/public-config')).data.referenceDate,'2026-10-30');
    assert.equal((await call('GET','/public-config')).data.businessTimeZone,process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul');
    assert.equal((await call('GET','/features',viewer)).data.simulation,false);
    assert.equal(require('../utils/attendance').businessToday(),'2026-10-30');
    t.diagnostic(`${mutations.length} write routes checked with both viewer and admin tokens; data unchanged.`);
});
