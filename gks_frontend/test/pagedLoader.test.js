import test from 'node:test';
import assert from 'node:assert/strict';
import { createPagedLoader } from '../src/utils/pagedLoader.js';

function fixture() {
  const calls = [];
  let state = {};
  let updates = 0;
  const loader = createPagedLoader((params, signal) => new Promise((resolve, reject) => {
    calls.push({ params, signal, resolve, reject });
  }), patch => { state = { ...state, ...patch }; updates++; });
  return { loader, calls, get state() { return state; }, get updates() { return updates; } };
}
const result = (id, page = 1) => ({ rows: [{ ID: id }], pagination: { page, total: 201, totalPages: 3 } });

test('a late response cannot replace the latest search even if cancellation is ignored', async () => {
  const f = fixture();
  const oldSearch = f.loader.search({ arama: 'old' });
  const newSearch = f.loader.search({ arama: 'new' });
  assert.equal(f.calls[0].signal.aborted, true);
  f.calls[1].resolve(result('new'));
  await newSearch;
  f.calls[0].resolve(result('old'));
  await oldSearch;
  assert.deepEqual(f.state.rows, [{ ID: 'new' }]);
  assert.equal(f.state.loading, false);
});

test('page changes and reconnect refresh keep submitted filters, not an edited draft', async () => {
  const f = fixture();
  await f.loader.refresh();
  assert.equal(f.calls.length, 0);
  const draft = { arama: 'submitted', baslangic: '2026-09-01' };
  const search = f.loader.search(draft);
  draft.arama = 'unsubmitted';
  f.calls[0].resolve(result('first'));
  await search;
  const page = f.loader.page(2);
  f.calls[1].resolve(result('second', 2));
  await page;
  const refresh = f.loader.refresh();
  assert.deepEqual(f.calls[2].params, { arama: 'submitted', baslangic: '2026-09-01', page: 2, limit: 100 });
  f.calls[2].resolve(result('refreshed', 2));
  await refresh;
  assert.equal(f.state.pagination.page, 2);
});

test('failed refresh clears obsolete rows, reports the server error and can recover', async () => {
  const f = fixture();
  const search = f.loader.search({});
  f.calls[0].resolve(result('old'));
  await search;
  const refresh = f.loader.refresh();
  f.calls[1].reject({ response: { data: { message: 'Geçersiz tarih aralığı.' } } });
  await refresh;
  assert.deepEqual(f.state.rows, []);
  assert.equal(f.state.error, 'Geçersiz tarih aralığı.');
  assert.equal(f.state.loading, false);
  const retry = f.loader.refresh();
  f.calls[2].resolve(result('recovered'));
  await retry;
  assert.equal(f.state.error, '');
  assert.deepEqual(f.state.rows, [{ ID: 'recovered' }]);
});

test('leaving a page prevents any update from its pending request', async () => {
  const f = fixture();
  const search = f.loader.search({});
  f.loader.cancel();
  const updates = f.updates;
  f.calls[0].reject(new Error('late failure'));
  await search;
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.updates, updates);
});
