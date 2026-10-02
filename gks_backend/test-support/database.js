const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Each suite owns a newly created database. DB_NAME never selects a cleanup target.
async function createTestDatabase(t, { beforeMigration } = {}) {
    require('dotenv').config({ quiet: true });
    if (process.env.NODE_ENV === 'production') throw new Error('DB tests cannot run in production mode.');
    const sql = require('mssql');
    const name = `GksTest_${randomUUID().replaceAll('-', '')}`;
    const master = await new sql.ConnectionPool({
        server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'master',
        options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' },
    }).connect();
    let created = false;
    t.after(async () => {
        await sql.close();
        try {
            if (created) {
                await master.request().query(`ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]`);
                t.diagnostic('Owned test database removed.');
            }
        } finally { await master.close(); }
    });
    await master.request().query(`CREATE DATABASE [${name}]`);
    created = true;
    process.env.DB_NAME = name;
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    process.env.DEMO_MODE = 'false';
    process.env.ENABLE_SETUP = 'false';
    process.env.ENABLE_SIMULATION = 'false';
    if (beforeMigration) {
        const legacy = await new sql.ConnectionPool({ ...master.config, database: name }).connect();
        try { await beforeMigration(legacy); } finally { await legacy.close(); }
    }
    const backend = path.resolve(__dirname, '..');
    // Run the actual migration command twice, including its skip path.
    for (let run = 0; run < 2; run++) {
        execFileSync(process.execPath, ['scripts/migrate.js'], { cwd: backend, env: process.env, stdio: 'pipe' });
    }
    t.diagnostic('Fresh schema migrated; repeated migration succeeded.');
}
module.exports = { createTestDatabase };
