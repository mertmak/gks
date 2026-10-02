const { sql } = require('../db');
const { inTransaction } = require('../utils/transaction');

// Runtime only: schema, migration, seed metadata and database administration
// remain with the separate installation account.
const permissions = Object.freeze({
    Users: 'SELECT, INSERT, UPDATE',
    Doors: 'SELECT, INSERT, UPDATE',
    Vardiyalar: 'SELECT, INSERT, UPDATE',
    Personel_Vardiya: 'SELECT, INSERT, UPDATE, DELETE',
    Personel_Calisma_Gecmisi: 'SELECT, INSERT',
    Permissions: 'SELECT, INSERT, DELETE',
    Izinler: 'SELECT, INSERT, DELETE',
    Mesai_Onaylari: 'SELECT, INSERT, UPDATE',
    Logs: 'SELECT, INSERT',
    SystemLogs: 'SELECT, INSERT',
    DoorLogs: 'SELECT, INSERT',
    Yoneticiler: 'SELECT, INSERT, UPDATE, DELETE',
});

async function configureRuntimeRole(userName) {
    if (typeof userName !== 'string' || !userName.trim() || userName.length > 128) {
        throw new Error('RUNTIME_DB_USER mevcut bir veritabanı kullanıcısı olmalıdır (1–128 karakter).');
    }
    return inTransaction(async tx => {
        const request = new sql.Request(tx).input('name', sql.NVarChar(128), userName);
        const found = await request.query("SELECT principal_id FROM sys.database_principals WHERE name=@name AND type IN ('S','U','G','E','X') AND principal_id>4");
        if (!found.recordset.length) throw new Error('Uygulama kullanıcısını önce hedef veritabanında oluşturun; dbo/guest/sistem hesapları kullanılamaz.');
        await new sql.Request(tx).query("IF DATABASE_PRINCIPAL_ID(N'gks_runtime') IS NULL CREATE ROLE [gks_runtime] AUTHORIZATION [dbo]");
        for (const [table, grants] of Object.entries(permissions)) {
            await new sql.Request(tx).query(`GRANT ${grants} ON OBJECT::dbo.[${table}] TO [gks_runtime]`);
        }
        const escapedUser = '[' + userName.replaceAll(']', ']]') + ']';
        await new sql.Request(tx).input('name', sql.NVarChar(128), userName).query(`
            IF NOT EXISTS (SELECT 1 FROM sys.database_role_members
                WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'gks_runtime')
                  AND member_principal_id=DATABASE_PRINCIPAL_ID(@name))
            ALTER ROLE [gks_runtime] ADD MEMBER ${escapedUser}`);
    });
}

module.exports = { configureRuntimeRole, permissions };
