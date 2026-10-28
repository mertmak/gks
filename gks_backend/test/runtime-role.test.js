const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('runtime role supports business writes and triggers without schema or audit deletion rights', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    // Roles are server-wide in PostgreSQL; this suite owns uniquely named ones.
    const suffix = process.env.DB_NAME.slice(-12);
    const role = `gksrt_${suffix}`;
    const user = `gksrt_user_${suffix}`;
    process.env.RUNTIME_DB_ROLE = role;
    const { sql, connectDB } = require('../db');
    await connectDB();
    const roleCount = async () => (await new sql.Request().input('role', sql.NVarChar, role)
        .query('SELECT COUNT(*) AS n FROM pg_roles WHERE rolname=@role')).recordset[0].n;
    const { configureRuntimeRole } = require('../services/runtimeRole');
    await assert.rejects(configureRuntimeRole('missing-user'), /önce oluşturun/);
    const installer = (await sql.query('SELECT current_user AS name')).recordset[0].name;
    await assert.rejects(configureRuntimeRole(installer), /sistem hesapları/);
    assert.equal(await roleCount(), 0);
    await sql.query(`CREATE ROLE ${user} NOLOGIN`);
    try {
        // A failure after earlier GRANTs must roll the entire setup back.
        await sql.query('ALTER TABLE Yoneticiler RENAME TO RoleTestAccounts');
        try {
            await assert.rejects(configureRuntimeRole(user), /yoneticiler/i);
            assert.equal(await roleCount(), 0);
        } finally { await sql.query('ALTER TABLE RoleTestAccounts RENAME TO Yoneticiler'); }
        await configureRuntimeRole(user);
        const cliOptions = { cwd: path.resolve(__dirname, '..'), stdio: 'pipe',
            env: { ...process.env, RUNTIME_DB_USER: user, RUNTIME_DB_CONFIRM: process.env.DB_NAME } };
        assert.throws(() => execFileSync(process.execPath, ['scripts/configure-runtime-role.js'], {
            ...cliOptions, env: { ...cliOptions.env, RUNTIME_DB_CONFIRM: 'wrong_target' },
        }));
        execFileSync(process.execPath, ['scripts/configure-runtime-role.js'], cliOptions);
        // Runs `work` with only the application user's privileges.
        const asRuntime = async work => {
            const tx = new sql.Transaction();
            await tx.begin();
            try {
                await new sql.Request(tx).query(`SET LOCAL ROLE ${user}`);
                const result = await work(text => new sql.Request(tx).query(text));
                await tx.commit();
                return result;
            } catch (error) {
                await tx.rollback();
                throw error;
            }
        };
        const result = await asRuntime(async query => {
            const uid = (await query(`INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No,Sistem_ID,Ise_Giris_Tarihi)
                VALUES('Runtime Person','runtime-card','runtime-1','runtime-1','2026-09-01') RETURNING ID`)).recordset[0].ID;
            const shift = (await query(`INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Calisma_Gunleri)
                VALUES('Runtime Shift','09:00','18:00','1,2,3,4,5') RETURNING ID`)).recordset[0].ID;
            await query(`INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) VALUES(${uid},${shift},'2026-09-01')`);
            const door = (await query("INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES('Runtime Door','Ana Giriş') RETURNING ID")).recordset[0].ID;
            await query(`INSERT INTO Permissions(User_ID,Door_ID) VALUES(${uid},${door})`);
            await query(`INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi) VALUES('RUNTIME-CARD',${door},'2026-09-07T09:00:00',true)`);
            await query("INSERT INTO SystemLogs(Islem_Tipi,Personel_Ad,Detay) VALUES('KABUL','Runtime Person','Fixture')");
            await query(`UPDATE Users SET Ad_Soyad='Runtime Updated' WHERE ID=${uid}`);
            await query(`DELETE FROM Permissions WHERE User_ID=${uid}`);
            return query('SELECT L.User_ID,P.Snapshot_Vardiya_Adi FROM Logs L JOIN Personel_Vardiya P ON P.User_ID=L.User_ID');
        });
        assert.equal(result.recordset.length, 1);
        assert.equal(result.recordset[0].Snapshot_Vardiya_Adi, 'Runtime Shift');
        for (const forbidden of [
            'DELETE FROM SystemLogs',
            "UPDATE DoorLogs SET Detay='changed'",
            'DELETE FROM Logs',
            'SELECT * FROM GksMigrations',
            'CREATE TABLE RuntimeForbidden(ID int)',
            'ALTER TABLE Users ADD RuntimeForbidden int',
            'CREATE SCHEMA runtime_forbidden',
        ]) await assert.rejects(asRuntime(query => query(forbidden)), /permission denied|must be owner/i, forbidden);
        assert.equal((await sql.query('SELECT COUNT(*) AS n FROM SystemLogs')).recordset[0].n, 1);
        // The demo's personal simulation copies are built by the runtime account.
        await configureRuntimeRole(user, { sandbox: true });
        const fs = require('node:fs');
        const migrations = path.resolve(__dirname, '../../database/migrations');
        const tx = new sql.Transaction();
        await tx.begin();
        try {
            const client = tx.activeClient();
            await client.query(`SET LOCAL ROLE ${user}`);
            await client.query('CREATE SCHEMA sbx_00000000000000aa');
            await client.query('SET LOCAL search_path TO sbx_00000000000000aa, public');
            for (const name of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) await client.query(fs.readFileSync(path.join(migrations, name), 'utf8'));
            await client.query('INSERT INTO Users OVERRIDING SYSTEM VALUE SELECT * FROM public.Users');
            assert.equal((await client.query('SELECT gks_search(Ad_Soyad) AS name FROM Users')).rows[0].name, 'runtime updated');
            await client.query('DROP SCHEMA sbx_00000000000000aa CASCADE');
            await tx.commit();
        } catch (error) { await tx.rollback(); throw error; }
        const canCreate = async () => (await new sql.Request().input('user', sql.NVarChar, user)
            .query("SELECT has_database_privilege(@user, current_database(), 'CREATE') AS n")).recordset[0].n;
        assert.equal(await canCreate(), true);
        await configureRuntimeRole(user);
        assert.equal(await canCreate(), false);
    } finally {
        await sql.query(`DROP OWNED BY ${user}; DROP ROLE ${user}`);
        if (await roleCount()) await sql.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
    }
});
