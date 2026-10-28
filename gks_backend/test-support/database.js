const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Each suite owns a newly created database. DB_NAME never selects a cleanup target.
async function createTestDatabase(t, { beforeMigration } = {}) {
    require('dotenv').config({ quiet: true });
    if (process.env.NODE_ENV === 'production') throw new Error('DB tests cannot run in production mode.');
    const pg = require('pg');
    const { sql, connectionConfig } = require('../db');
    const { createDatabase, dropDatabase } = require('../db/admin');
    const name = `gkstest_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client(connectionConfig('postgres'));
    await admin.connect();
    let created = false;
    t.after(async () => {
        await sql.close();
        try {
            if (created) {
                await dropDatabase(admin, name);
                t.diagnostic('Owned test database removed.');
            }
        } finally { await admin.end(); }
    });
    await createDatabase(admin, name);
    created = true;
    process.env.DB_NAME = name;
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    process.env.DEMO_MODE = 'false';
    process.env.ENABLE_SETUP = 'false';
    process.env.ENABLE_SIMULATION = 'false';
    process.env.GKS_STRICT_COLUMN_NAMES = 'true';
    if (beforeMigration) {
        const client = new pg.Client(connectionConfig(name));
        await client.connect();
        try { await beforeMigration(client); } finally { await client.end(); }
    }
    const backend = path.resolve(__dirname, '..');
    // Run the actual migration command twice, including its skip path.
    for (let run = 0; run < 2; run++) {
        execFileSync(process.execPath, ['scripts/migrate.js'], { cwd: backend, env: process.env, stdio: 'pipe' });
    }
    t.diagnostic('Fresh schema migrated; repeated migration succeeded.');
}
module.exports = { createTestDatabase };
