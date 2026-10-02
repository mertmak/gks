const test = require('node:test');
const assert = require('node:assert/strict');
const { schemas, validate } = require('../middlewares/validate');

test('new passwords cannot exceed bcrypt byte limit through multibyte characters', () => {
    for (const [name, body, field] of [
        ['ilkKurulumSchema', { username: 'fixture' }, 'password'],
        ['hesapEkleSchema', { username: 'fixture', rol: 'user' }, 'password'],
        ['sifreDegistirSchema', { eskiSifre: 'fixture-old' }, 'yeniSifre'],
    ]) {
        for (const value of ['a'.repeat(72), 'ş'.repeat(36), '🔑'.repeat(18)]) {
            assert.equal(schemas[name].safeParse({ ...body, [field]: value }).success, true, name);
        }
        for (const value of ['a'.repeat(73), 'ş'.repeat(37), '🔑'.repeat(19)]) {
            assert.equal(schemas[name].safeParse({ ...body, [field]: value }).success, false, name);
        }
    }
});

test('malformed or oversized JSON never echoes request content in client errors', () => {
    const handle = require('../middlewares/errorHandler');
    for (const [type, expected] of [['entity.parse.failed', 400], ['entity.too.large', 413]]) {
        let status, body;
        handle({ type, message: 'Fixture-secret-password-in-parser-error' }, {}, {
            status(value) { status = value; return this; }, json(value) { body = value; }
        }, () => assert.fail());
        assert.equal(status, expected);
        assert.equal(body.success, false);
        assert.equal(JSON.stringify(body).includes('Fixture-secret'), false);
    }
});

test('calendar bounds leave room for SQL overnight queries and enforce inclusive range length', () => {
    const { date, validDateRange } = require('../middlewares/validate');
    for (const value of ['0000-01-01', '1753-01-01', '9999-12-30', '9999-12-31', '2026-02-29', '2026-04-31', '', ['2026-09-07']]) assert.equal(date.safeParse(value).success, false, String(value));
    for (const value of ['1753-01-02', '9999-12-29', '2024-02-29']) assert.equal(date.safeParse(value).success, true, value);
    assert.equal(validDateRange('2024-01-01', '2024-12-31'), true);
    assert.equal(validDateRange('2024-01-01', '2025-01-01'), false);
    assert.equal(validDateRange('2026-09-07', '2026-09-06'), false);
    assert.equal(validDateRange('2026-09-01', '2026-10-01', 31), true);
    assert.equal(validDateRange('2026-09-01', '2026-10-02', 31), false);
});

test('SQL text limits accept 255 characters and reject overflow before the handler', () => {
    const cases = [
        ['izinEkleSchema', 'aciklama', { user_id: 1, izin_turu: 'İzin', baslangic: '2026-09-01', bitis: '2026-09-02' }],
        ['mesaiOnaySchema', 'aciklama', { user_id: 1, tarih: '2026-09-01', hesaplanan_dk: 60, onaylanan_dk: 60, durum: 'Onaylandı' }],
        ['mesaiBulkOnaySchema', 'aciklama', { mesailer: [{ user_id: 1, tarih: '2026-09-01', hesaplanan_dk: 60, onaylanan_dk: 60 }], durum: 'Onaylandı' }],
        ['personelStatusSchema', 'cikis_nedeni', { durum: 0, cikis_tarihi: '2026-09-01' }],
        ['bulkStatusSchema', 'cikis_nedeni', { hedef_turu: 'Tumu', durum: 0, cikis_tarihi: '2026-09-01' }],
    ];
    for (const [name, field, body] of cases) {
        const schema = schemas[name];
        assert.equal(schema.parse({ ...body, [field]: 'ş'.repeat(255) })[field].length, 255, name);
        let status;
        let response;
        validate(schema)({ body: { ...body, [field]: 'ş'.repeat(256) } }, {
            status(code) { status = code; return this; },
            json(value) { response = value; },
        }, () => assert.fail(`${name}: overflow reached handler`));
        assert.equal(status, 400, name);
        assert.equal(response.success, false, name);
        assert.match(response.message, /En fazla 255 karakter/, name);
    }
});
