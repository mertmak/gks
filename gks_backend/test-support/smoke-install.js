// Explicit opt-in local Docker acceptance. Owns one fresh DB and Compose project.
// Uses existing development PostgreSQL; never changes the configured DB_NAME database.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function main() {
    if (process.env.RUN_INSTALL_SMOKE !== 'true' || process.env.NODE_ENV === 'production') {
        throw new Error('Set RUN_INSTALL_SMOKE=true against a development PostgreSQL server.');
    }
    const pg = require('pg');
    const { connectionConfig } = require('../db');
    const { databaseExists, dropDatabase } = require('../db/admin');
    const tag = randomUUID().replaceAll('-', '');
    const database = `gkstest_${tag}`;
    const project = `gks-smoke-${tag.slice(0, 12)}`;
    const root = path.resolve(__dirname, '../..');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gks-install-'));
    const envFile = path.join(temp, 'runtime.env');
    const port = process.env.GKS_SMOKE_PORT || '18080';
    assert.match(port, /^\d{4,5}$/);
    const dockerEnv = { ...process.env, GKS_ENV_FILE: envFile, GKS_HTTP_PORT: port, GKS_ENABLE_SIMULATION: 'false' };
    const compose = ['compose', '-p', project, '-f', 'compose.yaml', '-f', 'compose.local.yaml'];
    const docker = args => execFileSync('docker', [...compose, ...args], {
        cwd: root, env: dockerEnv, stdio: 'pipe', timeout: 600000, maxBuffer: 20 * 1024 * 1024,
    });
    const runtime = {
        DB_SERVER: process.env.GKS_DOCKER_DB_SERVER || (/^(localhost|127\.0\.0\.1)$/.test(process.env.DB_SERVER) ? 'host.docker.internal' : process.env.DB_SERVER),
        DB_PORT: process.env.GKS_DOCKER_DB_PORT || process.env.DB_PORT || '5432', DB_NAME: database,
        DB_USER: process.env.DB_USER, DB_PASSWORD: process.env.DB_PASSWORD,
        DB_SSL: process.env.DB_SSL || 'false',
        JWT_SECRET: randomUUID() + randomUUID(), PORT: '3000', BUSINESS_TIMEZONE: 'Europe/Istanbul',
        DEMO_MODE: 'false', DEMO_SEED_CONFIRM: database,
        BOOTSTRAP_USERNAME: 'install-admin', BOOTSTRAP_PASSWORD: randomUUID() + '!Aa1',
    };
    const writeEnv = () => fs.writeFileSync(envFile, Object.entries(runtime).map(([key, value]) => {
        assert.equal(typeof value, 'string', `Missing ${key}`);
        return `${key}=${JSON.stringify(value).replace(/\$/g, () => '$$')}`;
    }).join('\n') + '\n', { mode: 0o600 });
    let master;
    let owned = false;
    let dockerStarted = false;
    try {
        master = new pg.Client(connectionConfig('postgres'));
        await master.connect();
        assert.equal(await databaseExists(master, database), false);
        writeEnv();
        console.log('Building application images.');
        docker(['build']);
        // The name did not exist and is generated exclusively for this run.
        owned = true;
        dockerStarted = true;
        for (const command of ['db:init', 'db:init', 'db:migrate', 'db:migrate', 'admin:create', 'seed:demo', 'seed:demo']) {
            docker(['run', '--rm', '--no-deps', 'backend', 'npm', 'run', command]);
            console.log(`Passed: ${command}`);
        }
        docker(['up', '-d', '--wait', '--wait-timeout', '90']);
        const base = `http://127.0.0.1:${port}`;
        // Compose knows when nginx is running, not when it accepts HTTP traffic.
        const waitForHttp = async () => {
            const deadline = Date.now() + 60000;
            while (Date.now() < deadline) {
                try {
                    if ((await fetch(base + '/api/status', { signal: AbortSignal.timeout(2000) })).ok) return;
                } catch { /* The nginx listener may still be starting. */ }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            throw new Error('nginx/API readiness timed out.');
        };
        await waitForHttp();
        const call = async (route, { token, method = 'GET', body } = {}) => {
            const response = await fetch(base + '/api' + route, {
                method, signal: AbortSignal.timeout(10000),
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: response.status, data: await response.json() };
        };
        assert.equal((await fetch(base + '/personel/liste')).status, 200);
        assert.equal((await call('/status')).status, 200);
        const login = await call('/login', { method: 'POST', body: { username: runtime.BOOTSTRAP_USERNAME, password: runtime.BOOTSTRAP_PASSWORD } });
        assert.equal(login.status, 200);
        const token = login.data.token;
        const users = await call('/users', { token });
        assert.equal(users.data.pagination.total, 12);
        const door = await call('/doors', { token, method: 'POST', body: { kapi_adi: 'Install Test Door', kapi_turu: 'İç Geçiş' } });
        assert.equal(door.status, 200);
        console.log('Passed: nginx SPA, health, admin login, 12 seeded users, local write.');
        docker(['restart', 'backend']);
        docker(['up', '-d', '--wait', '--wait-timeout', '90']);
        await waitForHttp();
        assert.equal((await call('/users', { token })).data.pagination.total, 12);
        console.log('Passed: restart retained database records and session signing key.');
        runtime.DEMO_MODE = 'true';
        delete runtime.BOOTSTRAP_PASSWORD;
        delete runtime.BOOTSTRAP_USERNAME;
        delete runtime.DEMO_SEED_CONFIRM;
        writeEnv();
        docker(['up', '-d', '--force-recreate', '--wait', '--wait-timeout', '90']);
        await waitForHttp();
        const config = await call('/public-config');
        assert.equal(config.data.referenceDate, '2026-09-07');
        const demo = await call('/demo-login', { method: 'POST' });
        assert.equal(demo.status, 200);
        for (const session of [token, demo.data.token]) {
            const blocked = await call('/doors', { token: session, method: 'POST', body: { kapi_adi: 'Must Not Exist' } });
            assert.equal(blocked.status, 403);
            assert.equal(blocked.data.code, 'DEMO_READ_ONLY');
        }
        const { io } = require('socket.io-client');
        await new Promise((resolve, reject) => {
            const socket = io(base, { auth: { token: demo.data.token }, transports: ['websocket'], reconnection: false, timeout: 10000 });
            socket.once('connect', () => { socket.disconnect(); resolve(); });
            socket.once('connect_error', error => { socket.disconnect(); reject(error); });
        });
        console.log('Passed: demo login, admin/viewer write denial, nginx WebSocket connection.');
    } finally {
        // Do not stop/remove any project or DB from an earlier run.
        try {
            if (dockerStarted) { docker(['down', '--volumes', '--remove-orphans']); console.log('Owned Compose project removed.'); }
        } finally {
            try {
                if (owned && master) {
                    await dropDatabase(master, database);
                    console.log('Owned install database removed.');
                }
            } finally {
                await master?.end();
                fs.rmSync(temp, { recursive: true, force: true });
            }
        }
    }
}
// Avoid echoing docker output or environment files containing runtime secrets.
main().catch(error => { console.error(error.code ? `Install smoke failed (${error.code}).` : error.message); process.exitCode = 1; });
