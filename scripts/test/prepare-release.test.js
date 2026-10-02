const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { isReleaseFile, findings, collect, exportRelease } = require('../prepare-release');

test('release allowlist excludes history, runtime data, credentials and traversal', () => {
    for (const file of ['.git/config', 'gks_backend/.env', 'gks_backend/.env.production', 'gks_backend/logs/a.json',
        'gks_frontend/node_modules/a/index.js', 'database/full.bak', 'database/data.mdf', 'docs/secret.pem',
        '../README.md', 'docs/../README.md', '/README.md', 'docs\\secret.md', 'personal.json', '.codex/settings.json',
        'notlar/V1-kalan-isler.md', 'notlar/docs/V1-durum-ozeti.md', 'V1-roadmap.md', 'project-inventory.md', 'CLAUDE.md']) {
        assert.equal(isReleaseFile(file), false, file);
    }
    for (const file of ['README.md', 'gks_backend/.env.example', 'gks_frontend/.dockerignore', '.github/workflows/checks.yml',
        'database/migrations/001_initial.sql', 'gks_frontend/src/App.jsx', 'gks_backend/test/audit.test.js']) {
        assert.equal(isReleaseFile(file), true, file);
    }
});

test('scan reports location and category without disclosing secret contents', () => {
    const secret = 'gh' + 'p_' + 'a'.repeat(36);
    const report = findings('docs/example.md', Buffer.from('example\n' + secret));
    assert.deepEqual(report, [{ file: 'docs/example.md', line: 2, rule: 'github-token' }]);
    assert.equal(JSON.stringify(report).includes(secret), false);
    assert.equal(findings('gks_backend/.env.example', Buffer.from('DB_PASSWORD=\nJWT_SECRET=\n')).length, 0);
    assert.equal(findings('gks_backend/.env.example', Buffer.from('DB_PASSWORD=' + 'not-empty')).length, 1);
    assert.equal(findings('src/key.js', Buffer.from('const SECRET' + '_KEY = "' + 'fixture-value' + '";')).length, 1);
});

test('export contains current files and verified hashes, never Git history; existing output is preserved', t => {
    const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gks-release-test-')));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const source = path.join(temp, 'source');
    fs.mkdirSync(path.join(source, 'gks_backend'), { recursive: true });
    fs.mkdirSync(path.join(source, '.git'));
    fs.writeFileSync(path.join(source, 'README.md'), 'current uncommitted content');
    fs.writeFileSync(path.join(source, '.git', 'config'), 'must not be exported');
    fs.writeFileSync(path.join(source, 'gks_backend', '.env'), 'private runtime state');
    const result = collect(source, ['README.md', 'README.md', '.git/config', 'gks_backend/.env', 'deleted.md']);
    assert.equal(result.files.length, 1);
    const output = exportRelease(source, result, path.join(temp, 'output'));
    const bytes = fs.readFileSync(path.join(output, 'README.md'));
    assert.equal(bytes.toString(), 'current uncommitted content');
    assert.equal(fs.existsSync(path.join(output, '.git')), false);
    assert.equal(fs.existsSync(path.join(output, 'gks_backend', '.env')), false);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'RELEASE-MANIFEST.json')));
    assert.equal(manifest.files[0].sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.throws(() => exportRelease(source, result, output), /already exists/);
    assert.equal(fs.readFileSync(path.join(output, 'README.md'), 'utf8'), bytes.toString());
    assert.throws(() => exportRelease(source, result, path.join(source, 'release')), /outside/);
    assert.throws(() => exportRelease(source, { ...result, issues: [{}] }, path.join(temp, 'blocked')), /findings/);
});

test('symlinks cannot pull external files or redirect an export inside the repository', t => {
    const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gks-release-link-')));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const source = path.join(temp, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(temp, 'external'), 'external private data');
    fs.symlinkSync(path.join(temp, 'external'), path.join(source, 'README.md'));
    assert.throws(() => collect(source, ['README.md']), /non-symlink/);
    fs.symlinkSync(source, path.join(temp, 'alias'));
    assert.throws(() => exportRelease(source, { files: [], issues: [] }, path.join(temp, 'alias', 'release')), /outside/);
});
