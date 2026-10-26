import { SvelteMap } from 'svelte/reactivity';
import { analyze, defaults, phases, toDay, today, type Settings } from './cycle';
import { merge } from './import';
import { isBleeding, isEmpty, type DayFields, type DayLog } from './log';
import { DeviceCopy, fieldsOf, withPending, type Pending } from './offline';
import { errorMessage, pb } from './pb';
import { session } from './session.svelte';

// The signed-in person's logged days, and what the cycle math makes of them.
// Changes are saved on the device first and sent to the server when it can be
// reached, so the app works offline (see offline.ts).
class Tracker {
  /** Day logs by date (YYYY-MM-DD). */
  logs = new SvelteMap<string, DayLog>();
  loaded = $state(false);
  error = $state('');
  /** The server couldn't be reached the last time we tried. */
  offline = $state(false);
  /** How many changed days are waiting to be sent. */
  unsynced = $state(0);
  now = $state(today());

  private device: DeviceCopy | null = null;
  private syncing: Promise<void> | null = null;

  settings: Settings = $derived({
    cycleLength: session.user?.cycle_length || defaults.cycleLength,
    periodLength: session.user?.period_length || defaults.periodLength,
    lutealLength: session.user?.luteal_length || defaults.lutealLength,
  });

  analysis = $derived(
    analyze(
      [...this.logs.values()].filter((l) => isBleeding(l.flow)).map((l) => toDay(l.date)),
      this.settings,
      this.now,
    ),
  );

  phases = $derived(phases(this.analysis));

  constructor() {
    // the app can stay open overnight, and the connection can come back
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.now = today();
      if (this.loaded) this.load();
    });
    addEventListener('online', () => this.loaded && this.load());
    // signed out here or elsewhere, or the login ran out
    pb.authStore.onChange(() => pb.authStore.isValid || this.close());
  }

  private show(logs: DayLog[]) {
    this.logs.clear();
    for (const l of logs) this.logs.set(l.date, l);
  }

  /** Shows the device's copy straight away, then sends changes and fetches the server's. */
  async load() {
    const user = session.user;
    if (!user) return;
    if (!this.device) {
      this.device = new DeviceCopy(user.id);
      this.show(withPending(this.device.logs(), this.device.pending(), user.id));
      this.unsynced = Object.keys(this.device.pending()).length;
      this.loaded = true;
    }
    this.error = '';
    await this.sync();
    try {
      const server = await pb.collection('days').getFullList<DayLog>({
        filter: pb.filter('user = {:user}', { user: user.id }),
        sort: 'date',
      });
      this.offline = false;
      this.device.saveLogs(server);
      // changes made while this was loading still apply
      this.show(withPending(server, this.device.pending(), user.id));
    } catch (err) {
      if (isOffline(err)) this.offline = true;
      else this.error = errorMessage(err, 'Could not load your calendar.');
    }
  }

  /** Saves changes to a day's log, removing the log when nothing is left in it. */
  async save(date: string, changes: Partial<DayLog>) {
    const user = session.user;
    if (!user || !this.device) return;
    const next = { ...fieldsOf(this.logs.get(date) ?? { date }), ...changes, date };
    const pending = this.device.pending();
    if (isEmpty(next)) {
      this.logs.delete(date);
      pending[date] = null;
    } else {
      const base =
        this.logs.get(date) ?? ({ id: '', collectionId: '', collectionName: 'days' } as DayLog);
      this.logs.set(date, { ...base, ...next, user: user.id });
      pending[date] = fieldsOf(next);
    }
    this.device.savePending(pending);
    this.device.saveLogs(this.logs.values());
    this.unsynced = Object.keys(pending).length;
    await this.sync();
  }

  /** Adds days read from a file, keeping what's already logged on each of them. */
  async import(days: DayFields[]) {
    const user = session.user;
    if (!user || !this.device) return;
    const pending = this.device.pending();
    for (const day of days) {
      const logged = this.logs.get(day.date);
      const next = merge(logged && fieldsOf(logged), day);
      if (logged && JSON.stringify(fieldsOf(logged)) === JSON.stringify(next)) continue;
      const base = logged ?? ({ id: '', collectionId: '', collectionName: 'days' } as DayLog);
      this.logs.set(day.date, { ...base, ...next, user: user.id });
      pending[day.date] = next;
    }
    this.device.savePending(pending);
    this.device.saveLogs(this.logs.values());
    this.unsynced = Object.keys(pending).length;
    await this.sync();
  }

  /** Marks a day as a period day, or not. */
  togglePeriod(date: string) {
    const flow = this.logs.get(date)?.flow ?? '';
    return this.save(date, { flow: isBleeding(flow) ? '' : 'medium' });
  }

  /** Sends the changes waiting on this device, one day at a time. */
  sync(): Promise<void> {
    this.syncing ??= this.send().finally(() => (this.syncing = null));
    return this.syncing;
  }

  private async send() {
    const user = session.user;
    const device = this.device;
    if (!user || !device) return;
    const days = pb.collection('days');
    for (const [date, fields] of Object.entries(device.pending())) {
      try {
        // another device may have logged the same day in the meantime
        const existing = await days
          .getFirstListItem<DayLog>(
            pb.filter('user = {:user} && date = {:date}', { user: user.id, date }),
          )
          .catch((err) => (err?.status === 404 ? null : Promise.reject(err)));
        let saved: DayLog | null = null;
        if (fields === null) {
          if (existing) await days.delete(existing.id);
        } else if (existing) {
          saved = await days.update<DayLog>(existing.id, fields);
        } else {
          saved = await days.create<DayLog>({ ...fields, user: user.id });
        }
        this.offline = false;
        this.done(device, date, fields, saved);
      } catch (err) {
        if (isOffline(err)) {
          this.offline = true;
          return;
        }
        // the server refused this change for good; drop it and keep going
        this.error = errorMessage(err, `Could not save ${date}.`);
        this.done(device, date, fields, null);
      }
    }
  }

  // forgets a sent change, unless it was changed again while it was being sent
  private done(device: DeviceCopy, date: string, sent: Pending[string], saved: DayLog | null) {
    const pending = device.pending();
    if (JSON.stringify(pending[date]) !== JSON.stringify(sent)) return;
    delete pending[date];
    device.savePending(pending);
    this.unsynced = Object.keys(pending).length;
    if (saved) this.logs.set(date, saved);
    device.saveLogs(this.logs.values());
  }

  /** Removes this person's data from the device, when they sign out. */
  forget() {
    const user = session.user;
    if (user) (this.device ?? new DeviceCopy(user.id)).forget();
    this.close();
  }

  /** Stops showing the logs, once nobody is signed in. */
  private close() {
    this.device = null;
    this.logs.clear();
    this.loaded = false;
    this.unsynced = 0;
  }
}

const isOffline = (err: unknown) => (err as { status?: number })?.status === 0;

export const tracker = new Tracker();
