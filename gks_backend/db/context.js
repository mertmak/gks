const { AsyncLocalStorage } = require('node:async_hooks');

// The schema of the request's personal simulation copy. db.js puts it first
// on search_path for every query; outside a sandbox request it is null.
const storage = new AsyncLocalStorage();
const pattern = /^sbx_[0-9a-f]{16}$/;

function runInSchema(schema, work) {
    if (!pattern.test(schema)) throw new Error('Geçersiz simülasyon şeması.');
    return storage.run({ schema }, work);
}
const outsideSchema = work => storage.exit(work);
const currentSchema = () => storage.getStore()?.schema ?? null;

module.exports = { runInSchema, outsideSchema, currentSchema, schemaPattern: pattern };
