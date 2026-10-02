// Maintenance helpers that run on the `postgres` database, not the app DB.
const business = require('../config/business');

const DB_NAME = /^[a-z][a-z0-9_]{0,62}$/;

function assertDatabaseName(name) {
    if (!DB_NAME.test(name || '')) throw new Error('Geçerli DB_NAME gerekli (küçük harf, rakam ve alt çizgi).');
    return name;
}

// UTF-8 with Turkish ICU rules for ordering and lower()/upper(); the default
// timezone matches BUSINESS_TIMEZONE so LOCALTIMESTAMP is local business time.
async function createDatabase(client, name) {
    assertDatabaseName(name);
    await client.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'tr-TR' LOCALE 'C.UTF-8'`);
    await client.query(`ALTER DATABASE ${name} SET timezone TO ${client.escapeLiteral(business.timeZone)}`);
}

async function databaseExists(client, name) {
    return (await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount > 0;
}

async function dropDatabase(client, name) {
    assertDatabaseName(name);
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}

module.exports = { assertDatabaseName, createDatabase, databaseExists, dropDatabase };
