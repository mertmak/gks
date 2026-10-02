const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');
test('business day follows configured timezone independently of host timezone', () => {
    const script = "const b=require('./config/business'); console.log(JSON.stringify([b.timeZone,b.date(new Date('2026-09-22T21:30:00Z'))]));";
    for (const [zone, day] of [['Europe/Istanbul', '2026-09-23'], ['America/Los_Angeles', '2026-09-22']]) {
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd, env: { ...process.env, TZ: 'Pacific/Kiritimati', BUSINESS_TIMEZONE: zone }, encoding: 'utf8',
        });
        assert.deepEqual(JSON.parse(output), [zone, day]);
    }
});

test('invalid business timezone fails at startup with a configuration error', () => {
    const result = spawnSync(process.execPath, ['-e', "require('./config/business')"], {
        cwd, env: { ...process.env, BUSINESS_TIMEZONE: 'invalid-zone' }, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BUSINESS_TIMEZONE geçerli bir IANA/);
});
