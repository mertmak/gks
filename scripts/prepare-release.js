#!/usr/bin/env node
// Export the reviewed working tree, never Git objects or local runtime state.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const allowedRoots = new Set(['.github', 'database', 'docs', 'gks_backend', 'gks_frontend', 'hosting', 'scripts']);
const allowedRootFiles = new Set(['.gitignore', '.dockerignore', 'README.md', 'compose.yaml', 'compose.local.yaml', 'compose.hosting.yaml', 'LICENSE']);
const blockedDirectories = new Set(['.git', '.codex', '.agents', 'node_modules', 'logs', 'dist', 'build', 'coverage', '.npm']);
const allowedExtensions = new Set(['.js', '.jsx', '.json', '.md', '.sql', '.yaml', '.yml', '.css', '.html', '.svg', '.png', '.conf', '.sh']);

function isReleaseFile(relative) {
    const parts = relative.split('/');
    if (path.isAbsolute(relative) || relative.includes('\\') || parts.some(part => !part || part === '.' || part === '..' || blockedDirectories.has(part))) return false;
    const name = parts.at(-1);
    if (name.startsWith('.env') && name !== '.env.example') return false;
    if (parts.length === 1) return allowedRootFiles.has(name);
    if (!allowedRoots.has(parts[0])) return false;
    return ['Dockerfile', 'Caddyfile', '.gitignore', '.dockerignore', '.env.example'].includes(name) || allowedExtensions.has(path.extname(name));
}

function findings(relative, buffer) {
    if (path.extname(relative) === '.png') return [];
    const content = buffer.toString('utf8');
    const rules = [
        ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
        ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
        ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
        ['personal-path', /\/Users\/[A-Za-z0-9._-]+\//],
        ['literal-session-key', /\b(?:JWT_SECRET|SECRET_KEY)\s*[:=]\s*['"][^'"\r\n]{8,}['"]/],
    ];
    const result = [];
    for (const [index, line] of content.split('\n').entries()) {
        for (const [rule, expression] of rules) if (expression.test(line)) result.push({ file: relative, line: index + 1, rule });
        if (relative.endsWith('/.env.example') && /^\s*(?:DB_PASSWORD|JWT_SECRET)\s*=\s*\S/.test(line)) {
            result.push({ file: relative, line: index + 1, rule: 'nonempty-example-secret' });
        }
    }
    return result;
}

function collect(sourceRoot, candidates) {
    const files = [];
    const excluded = [];
    const issues = [];
    for (const relative of [...new Set(candidates)].sort()) {
        if (!isReleaseFile(relative)) { excluded.push(relative); continue; }
        const source = path.join(sourceRoot, relative);
        // Deleted tracked files are deliberately absent from a working-tree export.
        if (!fs.existsSync(source)) continue;
        const resolved = fs.realpathSync(source);
        if (resolved !== source || !fs.lstatSync(source).isFile()) throw new Error(`Regular, non-symlink file required: ${relative}`);
        const bytes = fs.readFileSync(source);
        issues.push(...findings(relative, bytes));
        files.push({ path: relative, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    return { files, excluded, issues };
}

function exportRelease(sourceRoot, result, target) {
    if (result.issues.length) throw new Error('Resolve the reported scan findings before exporting.');
    const destination = path.resolve(target);
    const parent = fs.realpathSync(path.dirname(destination));
    const realDestination = path.join(parent, path.basename(destination));
    if (realDestination === sourceRoot || realDestination.startsWith(sourceRoot + path.sep)) throw new Error('Output must be outside the source repository.');
    if (fs.existsSync(realDestination)) throw new Error('Output already exists; choose a new directory.');
    const staging = fs.mkdtempSync(path.join(parent, '.gks-release-'));
    try {
        for (const file of result.files) {
            const out = path.join(staging, file.path);
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, file.bytes, { flag: 'wx', mode: 0o644 });
        }
        fs.writeFileSync(path.join(staging, 'RELEASE-MANIFEST.json'), JSON.stringify({
            generatedAt: new Date().toISOString(),
            source: 'working-tree-without-git-history',
            scanScope: 'limited-pattern-scan; manual review and target acceptance still required',
            files: result.files.map(({ path: name, sha256, bytes }) => ({ path: name, sha256, size: bytes.length })),
        }, null, 2) + '\n');
        // Reserve the name instead of replacing even an empty pre-existing target.
        fs.mkdirSync(realDestination);
        try {
            for (const name of fs.readdirSync(staging)) fs.renameSync(path.join(staging, name), path.join(realDestination, name));
        } catch (error) {
            fs.rmSync(realDestination, { recursive: true, force: true });
            throw error;
        }
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
    return realDestination;
}

function main() {
    const args = process.argv.slice(2);
    if (!(args.length === 0 || (args.length === 2 && args[0] === '--output'))) throw new Error('Usage: node scripts/prepare-release.js [--output /absolute/new-directory]');
    const sourceRoot = fs.realpathSync(root);
    const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: sourceRoot }).toString('utf8').split('\0').filter(Boolean);
    const result = collect(sourceRoot, candidates);
    console.log(JSON.stringify({ files: result.files.length, excluded: result.excluded, findings: result.issues }, null, 2));
    if (result.issues.length) { process.exitCode = 1; return; }
    if (args.length) console.log(`Prepared: ${exportRelease(sourceRoot, result, args[1])}`);
    else console.log('Dry run only. No files copied. This is not a complete secret/content audit.');
}

if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { isReleaseFile, findings, collect, exportRelease };
