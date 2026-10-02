const { setTimeout: delay } = require('node:timers/promises');
const { sql } = require('../db');

const RETRYABLE = new Set(['40001', '40P01']); // serialization failure, deadlock
const MAX_RETRIES = 3;

function httpError(statusCode, message) {
    return Object.assign(new Error(message), { statusCode });
}

// PostgreSQL SERIALIZABLE is optimistic: a conflicting transaction fails with
// 40001 and must be run again. `work` may only touch the database; events and
// other side effects belong after the returned promise resolves.
async function inTransaction(work, { retries = MAX_RETRIES } = {}) {
    for (let attempt = 0; ; attempt++) {
        const tx = new sql.Transaction();
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        try {
            const result = await work(tx);
            await tx.commit();
            return result;
        } catch (error) {
            if (tx.client) {
                try { await tx.rollback(); } catch { /* Preserve the original failure. */ }
            }
            if (!RETRYABLE.has(error.code) || attempt >= retries) throw error;
            await delay(10 + Math.floor(Math.random() * 40) * (attempt + 1));
        }
    }
}

function validateId(req, res, next, value) {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
        return res.status(400).json({ success: false, message: 'Geçerli bir kayıt ID değeri giriniz.' });
    }
    next();
}
module.exports = { inTransaction, httpError, validateId, isRetryable: error => RETRYABLE.has(error?.code) };
