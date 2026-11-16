import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskPlacement } from '../task-placement.mjs';

test('task fixtures choose a placement covering the whole Jakarta interval', () => {
    const future = { status: 'active', startsOn: '2035-01-01', endsOn: '2035-01-02' };
    const partial = { status: 'active', startsOn: '2026-11-17', endsOn: '2026-11-17' };
    const current = { status: 'active', startsOn: '2026-11-17', endsOn: '2026-11-18' };
    const starts = new Date('2026-11-17T16:30:00Z'), ends = new Date('2026-11-17T17:30:00Z');
    assert.equal(taskPlacement([future, partial, current], starts, ends), current);
    assert.throws(() => taskPlacement([future, partial, { ...current, status: 'cancelled' }], starts, ends), /No active synthetic placement/);
});
