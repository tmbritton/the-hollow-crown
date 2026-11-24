import { deepStrictEqual } from 'node:assert';
import { test } from 'node:test';
import { verifyEffect } from '../src/effect-probe.ts';

test('exact Effect release preserves sync and cancellation contracts', async () => {
  deepStrictEqual(await verifyEffect(), {
    service: 42,
    failure: 'placement',
    defectIdentity: true,
    asyncMismatch: true,
    asyncMismatchCleaned: true,
    signalAborted: true,
    interrupted: true,
    callbackCleanup: 1,
    finalizer: 1,
  });
});
