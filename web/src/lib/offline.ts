import type { DayFields, DayLog } from './log';

// Flowy keeps a copy of the signed-in person's day logs on the device, and the
// changes the server hasn't got yet, so it opens and saves without a connection.

/** What each changed day should look like on the server; null deletes the day. */
export type Pending = Record<string, DayFields | null>;

const logsKey = (user: string) => `flowy:days:${user}`;
const pendingKey = (user: string) => `flowy:pending:${user}`;

function read<T>(storage: Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function write(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // private browsing or a full disk: carry on online only
  }
}

export class DeviceCopy {
  constructor(
    private user: string,
    private storage: Storage = localStorage,
  ) {}

  logs(): DayLog[] {
    return read(this.storage, logsKey(this.user), []);
  }

  pending(): Pending {
    return read(this.storage, pendingKey(this.user), {});
  }

  saveLogs(logs: Iterable<DayLog>) {
    write(this.storage, logsKey(this.user), [...logs]);
  }

  savePending(pending: Pending) {
    write(this.storage, pendingKey(this.user), pending);
  }

  forget() {
    this.storage.removeItem(logsKey(this.user));
    this.storage.removeItem(pendingKey(this.user));
  }

  /** Removes the copy of the logs but keeps the changes not sent yet. */
  forgetSynced() {
    this.storage.removeItem(logsKey(this.user));
  }
}

/** The fields of a day log that are synced. */
export function fieldsOf(log: Partial<DayLog>): DayFields {
  return {
    date: log.date ?? '',
    flow: log.flow ?? '',
    symptoms: log.symptoms ?? [],
    custom_symptoms: log.custom_symptoms ?? [],
    moods: log.moods ?? [],
    sex: log.sex ?? '',
    pill: log.pill ?? false,
    temperature: log.temperature ?? 0,
    weight: log.weight ?? 0,
    notes: log.notes ?? '',
  };
}

/** The server's logs with the changes still waiting to be sent laid over them. */
export function withPending(server: DayLog[], pending: Pending, user: string): DayLog[] {
  const byDate = new Map(server.map((l) => [l.date, l]));
  for (const [date, fields] of Object.entries(pending)) {
    if (fields === null) byDate.delete(date);
    else {
      const base =
        byDate.get(date) ?? ({ id: '', collectionId: '', collectionName: 'days' } as DayLog);
      byDate.set(date, { ...base, ...fields, user, date });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
