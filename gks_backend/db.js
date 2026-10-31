require('dotenv').config({ quiet: true });
const fs = require('fs');
const pg = require('pg');
const logger = require('./utils/appLogger');
const business = require('./config/business');
const { translateParams } = require('./db/params');
const { canonical } = require('./db/columnNames');
const { currentSchema } = require('./db/context');

// Return the same JavaScript values the mssql driver produced (useUTC): stored
// wall-clock times are read as UTC and never shifted by the server timezone.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, value => new Date(value.replace(' ', 'T') + 'Z'));
pg.types.setTypeParser(pg.types.builtins.DATE, value => new Date(value + 'T00:00:00Z'));
pg.types.setTypeParser(pg.types.builtins.TIME, value => new Date('1970-01-01T' + value + 'Z'));
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
pg.defaults.parseInputDatesAsUTC = true;

// Type markers keep the mssql call shape. Non-string types add an explicit
// cast; strings stay untyped so PostgreSQL takes the type from the context.
const type = (name, pgCast) => {
    const marker = () => marker;
    return Object.assign(marker, { typeName: name, pgCast });
};
const types = {
    Int: type('Int', 'integer'), BigInt: type('BigInt', 'bigint'), Bit: type('Bit', 'boolean'),
    Date: type('Date', 'date'), DateTime: type('DateTime', 'timestamp'), DateTime2: type('DateTime2', 'timestamp'),
    Time: type('Time', 'time'), IntArray: type('IntArray', 'integer[]'), NVarChar: type('NVarChar'), VarChar: type('VarChar'),
};
const ISOLATION_LEVEL = Object.freeze({ READ_COMMITTED: 'READ COMMITTED', REPEATABLE_READ: 'REPEATABLE READ', SERIALIZABLE: 'SERIALIZABLE' });

function connectionConfig(database = process.env.DB_NAME) {
    const production = process.env.NODE_ENV === 'production';
    // Production always uses TLS with certificate verification.
    const ssl = production || process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized: production || process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
            ...(process.env.DB_SSL_CA ? { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8') } : {}),
        }
        : false;
    return {
        host: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, ssl,
        // LOCALTIMESTAMP and CURRENT_DATE follow the configured business day.
        options: `-c TimeZone=${business.timeZone}`,
        application_name: 'gks', connectionTimeoutMillis: 15000,
    };
}

const warned = new Set();
function columnName(name) {
    const known = canonical.get(name.toLowerCase());
    if (known) return known;
    if (name !== name.toLowerCase()) return name; // quoted alias keeps its spelling
    if (process.env.GKS_STRICT_COLUMN_NAMES === 'true') throw new Error(`Kolon adı sözlükte yok: ${name}`);
    if (!warned.has(name)) { warned.add(name); logger.warn(`Kolon adı sözlükte yok: ${name}`); }
    return name;
}

function toRecordset(result) {
    if (!result.fields?.length) return [];
    const names = result.fields.map(field => columnName(field.name));
    return result.rows.map(row => {
        const record = {};
        names.forEach((name, i) => { record[name] = row[i]; });
        return record;
    });
}

function toResult(raw) {
    const results = Array.isArray(raw) ? raw : [raw];
    const recordsets = results.filter(r => r.fields?.length).map(toRecordset);
    return { recordset: recordsets[0] || [], recordsets, rowsAffected: results.map(r => r.rowCount ?? 0) };
}

let pool = null;

// A sandbox schema shadows the public business tables for one transaction;
// public stays on the path for the shared functions and extensions.
const searchPath = schema => `SET LOCAL search_path TO ${pg.escapeIdentifier(schema)}, public`;

const connectDB = async () => {
    if (pool) return pool;
    const next = new pg.Pool({ ...connectionConfig(), max: 10, idleTimeoutMillis: 30000 });
    next.on('error', err => logger.error('Veritabanı havuz hatası: ' + err.message));
    try {
        (await next.connect()).release();
    } catch (err) {
        logger.error('Veritabanı bağlantı hatası: ' + err.message);
        await next.end().catch(() => {});
        throw err;
    }
    pool = next;
    logger.info('PostgreSQL veritabanına başarıyla bağlandı.');
    return pool;
};

const getPool = () => {
    if (!pool) throw new Error('Veritabanı bağlantısı henüz başlatılmadı. connectDB() önce çağrılmalıdır.');
    return pool;
};

// Builds text from a tagged template: query`... ${value} ...`.
function fromTemplate(request, strings, values) {
    values.forEach((value, i) => request.input('p' + i, value));
    return strings.reduce((text, part, i) => text + (i ? '@p' + (i - 1) : '') + part, '');
}

class Request {
    constructor(transaction) {
        this.transaction = transaction;
        this.params = new Map();
    }

    input(name, typeOrValue, value) {
        if (arguments.length === 2) this.params.set(name, { value: typeOrValue });
        else this.params.set(name, { type: typeOrValue, value });
        return this;
    }

    async query(text, ...values) {
        if (Array.isArray(text) && text.raw) text = fromTemplate(this, text, values);
        const translated = translateParams(text, this.params);
        const config = { text: translated.text, rowMode: 'array' };
        if (translated.values.length) config.values = translated.values;
        const schema = currentSchema();
        if (this.transaction || !schema) {
            const target = this.transaction ? this.transaction.activeClient() : getPool();
            return toResult(await target.query(config));
        }
        const tx = await new Transaction().begin();
        try {
            const result = await tx.activeClient().query(config);
            await tx.commit();
            return toResult(result);
        } catch (err) {
            if (tx.client) await tx.rollback().catch(() => {});
            throw err;
        }
    }
}

class Transaction {
    constructor() { this.client = null; }

    async begin(isolationLevel = ISOLATION_LEVEL.READ_COMMITTED) {
        if (this.client) throw new Error('İşlem zaten başlatıldı.');
        if (!Object.values(ISOLATION_LEVEL).includes(isolationLevel)) throw new Error('Geçersiz yalıtım düzeyi.');
        const client = await getPool().connect();
        try {
            await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
            const schema = currentSchema();
            if (schema) await client.query(searchPath(schema));
        } catch (err) {
            client.release(err);
            throw err;
        }
        this.client = client;
        return this;
    }

    activeClient() {
        if (!this.client) throw new Error('İşlem başlatılmadı ya da sona erdi.');
        return this.client;
    }

    async end(command) {
        const client = this.activeClient();
        this.client = null;
        let failure;
        try {
            const result = await client.query(command);
            // PostgreSQL answers COMMIT of an aborted transaction with ROLLBACK.
            if (command === 'COMMIT' && result.command === 'ROLLBACK') {
                throw Object.assign(new Error('İşlem daha önceki bir hata nedeniyle geri alındı.'), { code: '25P02' });
            }
        } catch (err) {
            failure = err;
            throw err;
        } finally {
            client.release(failure && !failure.code ? failure : undefined);
        }
    }

    commit() { return this.end('COMMIT'); }
    rollback() { return this.end('ROLLBACK'); }
}

const sql = {
    ...types, ISOLATION_LEVEL, Request, Transaction,
    query: (text, ...values) => new Request().query(text, ...values),
    close: async () => {
        const current = pool;
        pool = null;
        if (current) await current.end();
    },
};

module.exports = { sql, connectDB, getPool, connectionConfig, searchPath, internal: { columnName, toResult } };
