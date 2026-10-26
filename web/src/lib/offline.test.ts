import { describe, expect, it } from 'vitest';
import type { DayLog } from './log';
import { DeviceCopy, fieldsOf, withPending } from './offline';

class MemoryStorage {
  items = new Map<string, string>();
  getItem = (k: string) => this.items.get(k) ?? null;
  setItem = (k: string, v: string) => void this.items.set(k, v);
  removeItem = (k: string) => void this.items.delete(k);
}

const server = (date: string, l: Partial<DayLog> = {}) =>
  ({
    id: date,
    collectionId: 'c',
    collectionName: 'days',
    user: 'u1',
    ...fieldsOf({ date }),
    ...l,
  }) as DayLog;

describe('withPending', () => {
  it('lays unsent changes over the server copy', () => {
    const logs = withPending(
      [server('2026-01-01', { flow: 'light' }), server('2026-01-02', { flow: 'heavy' })],
      {
        '2026-01-02': null,
        '2026-01-01': fieldsOf({ date: '2026-01-01', flow: 'medium' }),
        '2025-12-31': fieldsOf({ date: '2025-12-31', notes: 'hi' }),
      },
      'u1',
    );
    expect(logs.map((l) => [l.date, l.flow, l.id])).toEqual([
      ['2025-12-31', '', ''],
      ['2026-01-01', 'medium', '2026-01-01'],
    ]);
  });
});

describe('DeviceCopy', () => {
  it('keeps each person apart and forgets on sign-out', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const alice = new DeviceCopy('alice', storage);
    alice.saveLogs([server('2026-01-01')]);
    alice.savePending({ '2026-01-02': null });
    expect(new DeviceCopy('bob', storage).logs()).toEqual([]);
    expect(new DeviceCopy('alice', storage).pending()).toEqual({ '2026-01-02': null });
    alice.forget();
    expect(alice.logs()).toEqual([]);
  });

  it('keeps unsent changes when only the synced copy goes', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const alice = new DeviceCopy('alice', storage);
    alice.saveLogs([server('2026-01-01')]);
    alice.savePending({ '2026-01-02': null });
    alice.forgetSynced();
    expect(alice.logs()).toEqual([]);
    expect(alice.pending()).toEqual({ '2026-01-02': null });
  });
});
