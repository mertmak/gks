const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { escapeIdentifier } = require('pg');
const { sql, searchPath } = require('../db');
const { schemaPattern } = require('../db/context');
const locks = require('../db/locks');
const config = require('../config/sandbox');
const logger = require('../utils/appLogger');

// Business tables copied from the public demo, parents before children.
// Accounts, migration and seed metadata never enter a sandbox.
const copied = ['Katlar', 'Bolgeler', 'Doors', 'Vardiyalar', 'Users', 'Permissions', 'Personel_Vardiya', 'Personel_Calisma_Gecmisi',
    'Izinler', 'Logs', 'Mesai_Onaylari', 'SystemLogs', 'DoorLogs'];
// Row limits per sandbox; checked once per INSERT statement.
const quotas = Object.freeze({
    Users: 300, Katlar: 10, Bolgeler: 60, Doors: 60, Vardiyalar: 30, Permissions: 10000, Personel_Vardiya: 3000, Personel_Calisma_Gecmisi: 3000,
    Izinler: 3000, Logs: 50000, Mesai_Onaylari: 10000, SystemLogs: 20000, DoorLogs: 5000,
});
const QUOTA_ERROR = 'GKSQ1';
const migrations = path.resolve(__dirname, '../../database/migrations');

const quotaFunction = `
CREATE FUNCTION gks_sandbox_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
    EXECUTE format('SELECT count(*) FROM %I.%I', TG_TABLE_SCHEMA, TG_TABLE_NAME) INTO total;
    IF total > TG_ARGV[0]::integer THEN
        RAISE EXCEPTION 'Simülasyon alanı kotası doldu: % (en fazla %).', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = '${QUOTA_ERROR}';
    END IF;
    RETURN NULL;
END;
$$`;

function schemaName(value) {
    if (!schemaPattern.test(value)) throw new Error('Geçersiz simülasyon şeması.');
    return value;
}

async function inSchemaTransaction(work) {
    const tx = new sql.Transaction();
    await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
        const result = await work(tx.activeClient());
        await tx.commit();
        return result;
    } catch (error) {
        if (tx.client) await tx.rollback().catch(() => {});
        throw error;
    }
}

// Builds the schema from the same migration files as the main database, then
// copies the current demo data, so the copy follows every future migration.
async function create() {
    const schema = `sbx_${randomBytes(8).toString('hex')}`;
    const created = await inSchemaTransaction(async client => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [locks.sandboxes]);
        const active = (await client.query('SELECT count(*)::int AS n FROM public.gkssandboxes WHERE bitis > LOCALTIMESTAMP')).rows[0].n;
        if (active >= config.maxActive) {
            throw Object.assign(new Error('Şu an çok fazla simülasyon alanı açık. Birkaç dakika sonra tekrar deneyin.'), { statusCode: 503, code: 'SANDBOX_FULL' });
        }
        await client.query(`CREATE SCHEMA ${escapeIdentifier(schema)}`);
        await client.query(searchPath(schema));
        for (const name of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
            await client.query(fs.readFileSync(path.join(migrations, name), 'utf8'));
        }
        await client.query('DROP TABLE gkssandboxes');
        for (const table of copied) {
            // Logs.User_ID was frozen at capture time; the copy must not recompute it.
            await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
            await client.query(`INSERT INTO ${table} OVERRIDING SYSTEM VALUE SELECT * FROM public.${table}`);
            await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
            await client.query(`SELECT setval(pg_get_serial_sequence('${table.toLowerCase()}', 'id'), COALESCE(max(id), 0) + 1, false) FROM ${table}`);
        }
        await client.query(quotaFunction);
        for (const [table, limit] of Object.entries(quotas)) {
            await client.query(`CREATE TRIGGER tr_sandbox_quota AFTER INSERT ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION gks_sandbox_quota(${Number(limit)})`);
        }
        return (await client.query(`INSERT INTO public.gkssandboxes(schema_adi, bitis)
            VALUES($1, LOCALTIMESTAMP + make_interval(mins => $2)) RETURNING bitis`, [schema, config.ttlMinutes])).rows[0];
    });
    logger.info('Simülasyon alanı oluşturuldu.');
    return { schema, expiresAt: created.bitis };
}

async function isActive(schema) {
    if (!config.enabled || !schemaPattern.test(schema || '')) return false;
    const result = await new sql.Request().input('schema', sql.VarChar, schema)
        .query('SELECT 1 AS n FROM public.GksSandboxes WHERE Schema_Adi=@schema AND Bitis > LOCALTIMESTAMP');
    return result.recordset.length > 0;
}

async function drop(schema) {
    schemaName(schema);
    await inSchemaTransaction(async client => {
        await client.query(`DROP SCHEMA IF EXISTS ${escapeIdentifier(schema)} CASCADE`);
        await client.query('DELETE FROM public.gkssandboxes WHERE schema_adi=$1', [schema]);
    });
}

// Expired copies, and with `all` every copy (startup: schemas built by older
// migrations must not outlive a deploy). Orphan sbx_ schemas are removed too.
async function purge({ all = false } = {}) {
    const result = await sql.query(`
        SELECT nspname AS name FROM pg_namespace N
        WHERE nspname ~ '^sbx_[0-9a-f]{16}$' AND pg_has_role(nspowner, 'USAGE')
          AND (${all ? 'true' : 'false'} OR NOT EXISTS (SELECT 1 FROM public.GksSandboxes S WHERE S.Schema_Adi=N.nspname AND S.Bitis > LOCALTIMESTAMP))
        UNION SELECT Schema_Adi FROM public.GksSandboxes WHERE ${all ? 'true' : 'Bitis <= LOCALTIMESTAMP'}`);
    for (const { name } of result.recordset) {
        try { await drop(name); } catch (error) { logger.error('Simülasyon alanı silinemedi: ' + error.message); }
    }
    return result.recordset.length;
}

module.exports = { create, isActive, drop, purge, quotas, copied, QUOTA_ERROR };
