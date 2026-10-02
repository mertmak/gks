require('dotenv').config({ quiet: true });
const sql = require('mssql');
const { setTimeout: delay } = require('node:timers/promises');

async function waitForDatabase() {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        const pool = new sql.ConnectionPool({
            server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'master',
            connectionTimeout: 3000, requestTimeout: 3000,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' }
        });
        try {
            await pool.connect();
            await pool.request().query('SELECT 1 AS ready');
            console.log('SQL bağlantısı hazır.');
            return;
        } catch {
            // Startup errors may contain connection details; only report readiness.
        } finally { await pool.close(); }
        await delay(2000);
    }
    throw new Error('SQL 120 saniye içinde hazır olmadı.');
}
waitForDatabase().catch(error => { console.error(error.message); process.exitCode = 1; });
