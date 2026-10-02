// Disposable local browser review. Ctrl+C removes only this run's database.
const cleanup = [];
const local = process.argv.includes('--local');
const failBulkOnce = process.argv.includes('--fail-bulk-once');
const failListsOnce = process.argv.includes('--fail-lists-once');
if (failListsOnce && !local) throw new Error('--fail-lists-once yalnız --local ile kullanılabilir.');
if (failBulkOnce && !local) throw new Error('--fail-bulk-once yalnız --local ile kullanılabilir.');
const apiPort = local ? 3101 : 3100;
const frontendPort = local ? 5175 : 5174;
(async () => {
    await require('./database').createTestDatabase({ after: fn => cleanup.push(fn), diagnostic: console.log });
    process.env.DEMO_MODE = local ? 'false' : 'true';process.env.DEMO_SEED_CONFIRM = process.env.DB_NAME;
    process.env.ENABLE_SIMULATION = local && process.argv.includes('--simulation') ? 'true' : 'false';
    process.env.FRONTEND_URL = `http://127.0.0.1:${frontendPort}`;
    const { connectDB, sql } = require('../db');await connectDB();
    await require('../services/demoSeed').seedDemo();
    if (local) {
        // Fixed fixture password exists only in this helper-owned temporary DB.
        const hash = await require('bcrypt').hash('Preview-Only-2026!', 10);
        await new sql.Request().input('hash', sql.VarChar, hash).query("INSERT INTO Yoneticiler(Kullanici_Adi,Sifre_Hash,Rol) VALUES('preview-admin',@hash,'admin'),('preview-user',@hash,'user')");
    }
    const { app } = require('../server');
    // Acceptance-only fault injection, isolated from the production app/routes.
    let bulkFailurePending = failBulkOnce;
    const pendingListFailures = new Set(failListsOnce ? ['/api/doors', '/api/shifts', '/api/leaves'] : []);
    const server = require('http').createServer((req, res) => {
        const pathname = req.url.split('?')[0];
        if (req.method === 'GET' && pendingListFailures.delete(pathname)) {
            res.writeHead(503, { 'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': process.env.FRONTEND_URL });
            res.end(JSON.stringify({ message: 'Kabul testi: liste geçici olarak yüklenemedi.' }));
            return;
        }
        if (bulkFailurePending && req.method === 'POST' && req.url === '/api/overtimes/approve-bulk') {
            bulkFailurePending = false;
            res.writeHead(503, { 'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': process.env.FRONTEND_URL });
            res.end(JSON.stringify({ message: 'Kabul testi: geçici hata. Aynı kapsamla yeniden deneyin.' }));
            req.resume();
            return;
        }
        app(req, res);
    });const io = require('../utils/socket').init(server);
    await new Promise(resolve => server.listen(apiPort,'127.0.0.1',resolve));
    const close = async () => {
        await new Promise(resolve => io.close(resolve));
        for(const fn of cleanup) await fn();
        process.exit(0);
    };
    process.once('SIGINT', close);process.once('SIGTERM', close);
    console.log(`Temporary ${local ? 'local' : 'demo'} API ready at http://127.0.0.1:${apiPort}`);
    console.log(`Owned acceptance database: ${process.env.DB_NAME}`);
})().catch(async error => { console.error(error.message);for(const fn of cleanup) await fn();process.exitCode=1; });
