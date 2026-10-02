const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('runtime role supports business writes and triggers without schema or audit deletion rights', { skip: process.env.RUN_DB_TESTS !== 'true' }, async t => {
    await require('../test-support/database').createTestDatabase(t);
    const { sql, connectDB } = require('../db');
    await connectDB();
    const { configureRuntimeRole } = require('../services/runtimeRole');
    await assert.rejects(configureRuntimeRole('missing-user'), /önce hedef veritabanında/);
    await assert.rejects(configureRuntimeRole('dbo'), /sistem hesapları/);
    assert.equal((await sql.query("SELECT DATABASE_PRINCIPAL_ID(N'gks_runtime') AS id")).recordset[0].id, null);
    await sql.query('CREATE USER [runtime-fixture] WITHOUT LOGIN');
    // A failure after earlier GRANTs must roll the entire setup back.
    await sql.query("EXEC sp_rename N'dbo.Yoneticiler', N'RoleTestAccounts'");
    try {
        await assert.rejects(configureRuntimeRole('runtime-fixture'), /Yoneticiler/);
        assert.equal((await sql.query("SELECT DATABASE_PRINCIPAL_ID(N'gks_runtime') AS id")).recordset[0].id, null);
    } finally { await sql.query("EXEC sp_rename N'dbo.RoleTestAccounts', N'Yoneticiler'"); }
    await configureRuntimeRole('runtime-fixture');
    const cliOptions = { cwd: path.resolve(__dirname, '..'), stdio: 'pipe',
        env: { ...process.env, RUNTIME_DB_USER: 'runtime-fixture', RUNTIME_DB_CONFIRM: process.env.DB_NAME } };
    assert.throws(() => execFileSync(process.execPath, ['scripts/configure-runtime-role.js'], {
        ...cliOptions, env: { ...cliOptions.env, RUNTIME_DB_CONFIRM: 'WrongTarget' },
    }));
    execFileSync(process.execPath, ['scripts/configure-runtime-role.js'], cliOptions);
    const asRuntime = statement => sql.query(`
      EXECUTE AS USER=N'runtime-fixture';
      BEGIN TRY
        ${statement}
      END TRY
      BEGIN CATCH
        REVERT;
        THROW;
      END CATCH;
      REVERT;
    `);
    const result = await asRuntime(`
      INSERT INTO Users(Ad_Soyad,RFID_Kart_No,Sicil_No,Sistem_ID,Ise_Giris_Tarihi)
        VALUES(N'Runtime Person',N'runtime-card',N'runtime-1',N'runtime-1','2026-09-01');
      DECLARE @uid int=SCOPE_IDENTITY();
      INSERT INTO Vardiyalar(Vardiya_Adi,Mesai_Baslangic,Mesai_Bitis,Calisma_Gunleri)
        VALUES(N'Runtime Shift','09:00','18:00','1,2,3,4,5');
      DECLARE @shift int=SCOPE_IDENTITY();
      INSERT INTO Personel_Vardiya(User_ID,Vardiya_ID,Baslangic_Tarihi) VALUES(@uid,@shift,'2026-09-01');
      INSERT INTO Doors(Kapi_Adi,Kapi_Turu) VALUES(N'Runtime Door',N'Ana Giriş');
      DECLARE @door int=SCOPE_IDENTITY();
      INSERT INTO Permissions(User_ID,Door_ID) VALUES(@uid,@door);
      INSERT INTO Logs(RFID_Kart_No,Door_ID,Zaman,Basarili_Mi) VALUES(N'runtime-card',@door,'2026-09-07T09:00:00',1);
      INSERT INTO SystemLogs(Islem_Tipi,Personel_Ad,Detay) VALUES(N'KABUL',N'Runtime Person',N'Fixture');
      UPDATE Users SET Ad_Soyad=N'Runtime Updated' WHERE ID=@uid;
      DELETE FROM Permissions WHERE User_ID=@uid;
      SELECT L.User_ID,P.Snapshot_Vardiya_Adi FROM Logs L JOIN Personel_Vardiya P ON P.User_ID=L.User_ID;
    `);
    assert.equal(result.recordset.length, 1);
    assert.equal(result.recordset[0].Snapshot_Vardiya_Adi, 'Runtime Shift');
    for (const forbidden of [
        'DELETE FROM SystemLogs',
        'UPDATE DoorLogs SET Detay=N\'changed\'',
        'DELETE FROM Logs',
        'SELECT * FROM dbo.GksMigrations',
        'CREATE TABLE dbo.RuntimeForbidden(ID int)',
        'ALTER TABLE dbo.Users ADD RuntimeForbidden int',
    ]) await assert.rejects(asRuntime(forbidden), /permission|denied|does not exist/i, forbidden);
    assert.equal((await sql.query('SELECT COUNT(*) AS n FROM SystemLogs')).recordset[0].n, 1);
});
