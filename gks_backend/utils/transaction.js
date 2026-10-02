const { sql } = require('../db');

function httpError(statusCode, message) {
    return Object.assign(new Error(message), { statusCode });
}

async function inTransaction(work) {
    const tx = new sql.Transaction();
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const result = await work(tx);
        await tx.commit();
        return result;
    } catch (error) {
        try { await tx.rollback(); } catch { /* Preserve the original failure. */ }
        throw error;
    }
}

function validateId(req, res, next, value) {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
        return res.status(400).json({ success: false, message: 'Geçerli bir kayıt ID değeri giriniz.' });
    }
    next();
}
module.exports = { inTransaction, httpError, validateId };
