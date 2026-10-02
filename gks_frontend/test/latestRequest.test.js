import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequest } from '../src/utils/latestRequest.js';

test('new search suppresses late results and failures from a superseded search', async () => {
  const request = createLatestRequest();
  let finishOld;
  let oldSignal;
  const old = request.run(signal => { oldSignal = signal; return new Promise(resolve => { finishOld = resolve; }); });
  assert.deepEqual(await request.run(async () => ['new']), ['new']);
  finishOld(['old']);
  assert.equal(await old, undefined);
  assert.equal(oldSignal.aborted, true);
  let failOld;
  const failed = request.run(() => new Promise((resolve, reject) => { failOld = reject; }));
  request.cancel();
  failOld(new Error('cancelled late'));
  assert.equal(await failed, undefined);
});

test('clearing a search or leaving the page invalidates pending suggestions', async () => {
  const request = createLatestRequest();
  let finish;
  const result = request.run(() => new Promise(resolve => { finish = resolve; }));
  request.cancel();
  finish(['obsolete suggestion']);
  assert.equal(await result, undefined);
  await assert.rejects(request.run(async () => { throw new Error('current failure'); }), /current failure/);
  assert.equal(await request.run(async () => 'recovered'), 'recovered');
});
