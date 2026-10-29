const test = require('node:test');
const assert = require('node:assert/strict');
const { passageMeaning } = require('../utils/passageMeaning');
const { area, isSimple } = require('../utils/polygon');

test('a passage means what the two areas imply, whatever door it uses', () => {
    for (const [from, to, meaning] of [
        [null, 'Lobi', 'Ana Giriş'], [null, 'Yemekhane', 'Ana Giriş'], ['Lobi', null, 'Ana Çıkış'], ['Mola', null, 'Ana Çıkış'],
        ['Ofis', 'Yemekhane', 'Yemekhane Giriş'], ['Merdiven/Asansör', 'Yemekhane', 'Yemekhane Giriş'], ['Yemekhane', 'Üretim', 'Yemekhane Çıkış'],
        ['Ofis', 'Mola', 'Mola / Sigara Alanı'], ['Mola', 'Ofis', 'İç Geçiş'], ['Lobi', 'Soyunma', 'İç Geçiş'],
    ]) assert.equal(passageMeaning(from, to), meaning, `${from} → ${to}`);
});

test('plan polygons must be simple and cover an area', () => {
    const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
    assert.equal(area(square), 10000);
    assert.ok(isSimple(square));
    assert.ok(isSimple([[0, 0], [200, 0], [200, 200], [100, 200], [100, 100], [0, 100]]), 'L shape');
    assert.ok(!isSimple([[0, 0], [100, 100], [100, 0], [0, 100]]), 'bow tie');
    assert.ok(!isSimple([[0, 0], [100, 0], [50, 0], [50, 50]]), 'edge folds back');
    assert.ok(!isSimple([[0, 0], [100, 0], [100, 100], [0, 0], [0, 100]]), 'repeated point');
    assert.ok(!isSimple([[0, 0], [200, 0], [200, 100], [100, 0], [0, 100]]), 'corner touches an edge');
});
