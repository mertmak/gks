require('dotenv').config({ quiet: true });
const pg = require('pg');
const { setTimeout: delay } = require('node:timers/promises');
const { connectionConfig } = require('../db');

async function waitForDatabase() {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        const client = new pg.Client({ ...connectionConfig('postgres'), connectionTimeoutMillis: 3000 });
        try {
            await client.connect();
            await client.query('SELECT 1 AS ready');
            console.log('SQL bağlantısı hazır.');
            return;
        } catch {
            // Startup errors may contain connection details; only report readiness.
        } finally { await client.end().catch(() => {}); }
        await delay(2000);
    }
    throw new Error('SQL 120 saniye içinde hazır olmadı.');
}
waitForDatabase().catch(error => { console.error(error.message); process.exitCode = 1; });
