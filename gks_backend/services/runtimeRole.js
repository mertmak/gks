const { escapeIdentifier } = require('pg');
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

// PostgreSQL roles belong to the whole server, not to one database.
function runtimeRoleName() {
    const name = process.env.RUNTIME_DB_ROLE || 'gks_runtime';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error('RUNTIME_DB_ROLE küçük harf, rakam ve alt çizgiden oluşmalıdır.');
    return name;
}

async function configureRuntimeRole(userName) {
    if (typeof userName !== 'string' || !userName.trim() || userName.length > 63) {
        throw new Error('RUNTIME_DB_USER mevcut bir veritabanı kullanıcısı olmalıdır (1–63 karakter).');
    }
    const role = runtimeRoleName();
    return inTransaction(async tx => {
        const found = await new sql.Request(tx).input('name', sql.NVarChar, userName).input('role', sql.NVarChar, role).query(`
            SELECT 1 AS n FROM pg_roles WHERE rolname=@name AND rolname<>@role AND rolname<>current_user
              AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls AND rolname NOT LIKE 'pg\\_%'`);
        if (!found.recordset.length) throw new Error('Uygulama kullanıcısını önce oluşturun; kurulum, süper kullanıcı ve sistem hesapları kullanılamaz.');
        const exists = await new sql.Request(tx).input('role', sql.NVarChar, role).query('SELECT 1 AS n FROM pg_roles WHERE rolname=@role');
        if (!exists.recordset.length) await new sql.Request(tx).query(`CREATE ROLE ${role} NOLOGIN`);
        await new sql.Request(tx).query(`GRANT USAGE ON SCHEMA public TO ${role}`);
        for (const [table, grants] of Object.entries(permissions)) {
            await new sql.Request(tx).query(`GRANT ${grants} ON TABLE ${table} TO ${role}`);
        }
        const member = await new sql.Request(tx).input('name', sql.NVarChar, userName).input('role', sql.NVarChar, role)
            .query('SELECT 1 AS n FROM pg_auth_members M JOIN pg_roles R ON R.oid=M.roleid JOIN pg_roles U ON U.oid=M.member WHERE R.rolname=@role AND U.rolname=@name');
        if (!member.recordset.length) await new sql.Request(tx).query(`GRANT ${role} TO ${escapeIdentifier(userName)}`);
    });
}

module.exports = { configureRuntimeRole, permissions, runtimeRoleName };
