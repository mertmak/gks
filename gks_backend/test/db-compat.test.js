const test = require('node:test');
const assert = require('node:assert/strict');
const { translateParams } = require('../db/params');
const { sql, internal } = require('../db');

const params = entries => new Map(Object.entries(entries).map(([name, param]) => [name, param]));

test('@name parametreleri $n yer tutucusuna çevrilir; tekrar eden ad aynı numarayı kullanır', () => {
    const result = translateParams('SELECT * FROM Users WHERE ID=@id OR Sistem_ID=@sid OR ID=@id', params({
        id: { type: sql.Int, value: 5 }, sid: { value: '9' },
    }));
    assert.equal(result.text, 'SELECT * FROM Users WHERE ID=$1::integer OR Sistem_ID=$2 OR ID=$1::integer');
    assert.deepEqual(result.values, [5, '9']);
});

test('tırnak, yorum ve $$ bloklarındaki @ parametre sayılmaz', () => {
    const text = "SELECT '@a', \"@b\", 'it''s @c' -- @d\n/* @e */ , $$ @f $$, $x$ @g $x$, @h";
    const result = translateParams(text, params({ h: { type: sql.Date, value: '2026-09-07' } }));
    assert.equal(result.text, text.replace('@h', '$1::date'));
    assert.deepEqual(result.values, ['2026-09-07']);
});

test('tanımsız parametre ve kapanmamış tırnak hata verir', () => {
    assert.throws(() => translateParams('SELECT @missing', new Map()), /@missing/);
    assert.throws(() => translateParams("SELECT 'open", new Map()), /tırnak/);
});

test('tip işaretleri mssql çağrı biçimini korur', () => {
    assert.equal(sql.NVarChar(50), sql.NVarChar);
    assert.equal(sql.Bit.pgCast, 'boolean');
    assert.equal(sql.DateTime.pgCast, 'timestamp');
    assert.equal(sql.VarChar.pgCast, undefined);
});

test('sonuç anahtarları kanonik yazıma döner; bilinmeyen anahtar strict modda hata verir', () => {
    const raw = { fields: [{ name: 'id' }, { name: 'ad_soyad' }, { name: 'Quoted' }], rows: [[1, 'Ayşe', true]], rowCount: 1 };
    assert.deepEqual(internal.toResult(raw), { recordset: [{ ID: 1, Ad_Soyad: 'Ayşe', Quoted: true }], recordsets: [[{ ID: 1, Ad_Soyad: 'Ayşe', Quoted: true }]], rowsAffected: [1] });
    assert.deepEqual(internal.toResult({ command: 'UPDATE', fields: [], rows: [], rowCount: 3 }).rowsAffected, [3]);
    const previous = process.env.GKS_STRICT_COLUMN_NAMES;
    process.env.GKS_STRICT_COLUMN_NAMES = 'true';
    try { assert.throws(() => internal.columnName('bilinmeyen_kolon'), /sözlükte yok/); }
    finally { if (previous === undefined) delete process.env.GKS_STRICT_COLUMN_NAMES; else process.env.GKS_STRICT_COLUMN_NAMES = previous; }
});
