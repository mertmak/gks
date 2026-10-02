const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const spec = require('../utils/swagger');

test('OpenAPI covers every registered API method, path ID and schema reference', () => {
    const routes = path.resolve(__dirname, '../routes');
    const registered = [];
    for (const file of fs.readdirSync(routes).filter(file => file.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(routes, file), 'utf8');
        for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g)) registered.push([match[1], match[2].replace(/:([a-zA-Z]+)/g, '{$1}')]);
    }
    const server = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    for (const match of server.matchAll(/app\.(get|post)\(['"]\/api([^'"]+)['"]/g)) registered.push([match[1], match[2]]);
    const actual = registered.map(([method, route]) => method + ' ' + route).sort();
    const documented = Object.entries(spec.paths).flatMap(([route, methods]) => Object.keys(methods).map(method => method + ' ' + route)).sort();
    assert.deepEqual(documented, actual);
    for (const [method, route] of registered) {
        const operation = spec.paths[route][method];
        assert.ok(operation.summary);
        assert.ok(operation.responses[200]);
        if (route.includes('{id}')) assert.ok(operation.parameters.some(parameter => parameter.in === 'path' && parameter.name === 'id' && parameter.required));
    }
    function visit(value) {
        if (!value || typeof value !== 'object') return;
        if (value.$ref) {
            const target = value.$ref.slice(2).split('/').reduce((current, part) => current?.[part], spec);
            assert.ok(target, value.$ref);
        }
        Object.values(value).forEach(visit);
    }
    visit(spec);
    for (const route of ['/login', '/demo-login', '/ilk-kurulum', '/public-config', '/status']) {
        const operation = Object.values(spec.paths[route])[0];
        assert.deepEqual(operation.security, [], route);
    }
    assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
});
