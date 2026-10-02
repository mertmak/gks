// Translates mssql-style @name parameters to PostgreSQL $n placeholders.
// Quoted strings, quoted identifiers, dollar-quoted bodies and comments are
// copied unchanged, so '@' inside them is never treated as a parameter.
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;

function skipQuoted(text, start, quote) {
    let i = start + 1;
    while (i < text.length) {
        if (text[i] === quote) {
            if (text[i + 1] === quote) { i += 2; continue; }
            return i + 1;
        }
        i++;
    }
    throw new Error('SQL metninde kapanmamış tırnak var.');
}

function translateParams(text, params = new Map()) {
    const order = [];
    const index = new Map();
    let out = '';
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        const next = text[i + 1];
        let end = i + 1;
        if (ch === "'" || ch === '"') end = skipQuoted(text, i, ch);
        else if (ch === '-' && next === '-') {
            end = text.indexOf('\n', i);
            if (end < 0) end = text.length;
        } else if (ch === '/' && next === '*') {
            end = text.indexOf('*/', i + 2);
            if (end < 0) throw new Error('SQL metninde kapanmamış yorum var.');
            end += 2;
        } else if (ch === '$' && !/[A-Za-z0-9_]/.test(text[i - 1] || '')) {
            DOLLAR_TAG.lastIndex = i;
            const tag = DOLLAR_TAG.exec(text);
            if (tag) {
                const close = text.indexOf(tag[0], i + tag[0].length);
                if (close < 0) throw new Error('SQL metninde kapanmamış $$ bloğu var.');
                end = close + tag[0].length;
            }
        } else if (ch === '@' && next !== '@' && text[i - 1] !== '@') {
            NAME.lastIndex = i + 1;
            const match = NAME.exec(text);
            if (match) {
                const name = match[0];
                if (!params.has(name)) throw new Error(`SQL parametresi tanımlanmadı: @${name}`);
                if (!index.has(name)) { order.push(name); index.set(name, order.length); }
                const param = params.get(name);
                out += '$' + index.get(name) + (param.type?.pgCast ? '::' + param.type.pgCast : '');
                i += 1 + name.length;
                continue;
            }
        }
        out += text.slice(i, end);
        i = end;
    }
    return { text: out, values: order.map(name => params.get(name).value) };
}

module.exports = { translateParams };
