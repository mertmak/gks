require('dotenv').config({ quiet: true });
const { connectDB, sql } = require('../db');

(async () => {
    if (!process.env.DB_NAME || process.env.RUNTIME_DB_CONFIRM !== process.env.DB_NAME) {
        throw new Error('Hedefi doğrulamak için RUNTIME_DB_CONFIRM değerini DB_NAME ile aynı yapın.');
    }
    await connectDB();
    await require('../services/runtimeRole').configureRuntimeRole(process.env.RUNTIME_DB_USER, { sandbox: process.env.SANDBOX_MODE === 'true' });
    console.log('Uygulama rolü yapılandırıldı. Mevcut ek kullanıcı/rol yetkileri otomatik kaldırılmadı.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.close());
