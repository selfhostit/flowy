<script lang="ts">
  import { badge } from '../lib/badge.svelte';
  import { defaults, toDay } from '../lib/cycle';
  import { formatDay } from '../lib/format';
  import { parseImport, type Imported } from '../lib/import';
  import { exportCsv, isBleeding } from '../lib/log';
  import { install } from '../lib/install.svelte';
  import { errorMessage, pb, type User } from '../lib/pb';
  import { session } from '../lib/session.svelte';
  import { tracker } from '../lib/tracker.svelte';
  import Notifications from './Notifications.svelte';
  import PartnerShare from './PartnerShare.svelte';

  const user = $derived(session.user!);
  const version = pb
    .send<{ version: string }>('/api/app/info', {})
    .then((i) => i.version)
    .catch(() => '');

  let cycleLength = $state(session.user?.cycle_length || defaults.cycleLength);
  let periodLength = $state(session.user?.period_length || defaults.periodLength);
  let lutealLength = $state(session.user?.luteal_length || defaults.lutealLength);
  let busy = $state(false);
  let message = $state('');

  async function update(changes: Partial<User>) {
    message = '';
    try {
      // the SDK refreshes the signed-in user, so predictions update straight away
      await pb.collection('users').update(user.id, changes);
      return true;
    } catch (err) {
      message = errorMessage(err, 'Could not save. Please try again.');
      return false;
    }
  }

  function signOut() {
    tracker.forget();
    session.logout();
  }

  function download(csv: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'flowy.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  let importing: Imported | null = $state(null);
  let importMessage = $state('');

  const shortDate = (iso: string) =>
    formatDay(toDay(iso), { day: 'numeric', month: 'short', year: 'numeric' });

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    importing = null;
    importMessage = '';
    if (!file) return;
    try {
      importing = parseImport(await file.text(), periodLength);
    } catch (err) {
      importMessage = err instanceof Error ? err.message : 'Could not read the file.';
    }
  }

  async function confirmImport() {
    const days = importing!.days;
    importing = null;
    await tracker.import(days);
    importMessage = `Imported ${days.length} ${days.length === 1 ? 'day' : 'days'}.`;
  }

  async function saveCycle(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    if (
      await update({
        cycle_length: cycleLength,
        period_length: periodLength,
        luteal_length: lutealLength,
      })
    ) {
      message = 'Saved.';
    }
    busy = false;
  }
</script>

<h1 class="text-2xl font-bold tracking-tight">Settings</h1>

<form class="card flex flex-col gap-4" onsubmit={saveCycle}>
  <div>
    <h2 class="font-semibold">Your cycle</h2>
    <p class="mt-1 text-sm text-zinc-500">
      {tracker.analysis.learned
        ? `Flowy now predicts from your logged periods (a ${tracker.analysis.cycleLength}-day cycle). These are used if it can't.`
        : 'Flowy uses these until you have logged two periods.'}
    </p>
  </div>
  <div class="grid grid-cols-2 gap-3">
    <label
      >Cycle length (days)<input
        type="number"
        min="15"
        max="60"
        bind:value={cycleLength}
        required
      /></label
    >
    <label
      >Period length (days)<input
        type="number"
        min="1"
        max="15"
        bind:value={periodLength}
        required
      /></label
    >
  </div>
  <label>
    Days from ovulation to period
    <input type="number" min="7" max="20" bind:value={lutealLength} required />
    <span class="font-normal text-zinc-500"
      >14 for most people. Leave it unless you know yours.</span
    >
  </label>
  <button class="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
  {#if message}<p class="text-sm text-zinc-500" role="status">{message}</p>{/if}
</form>

<section class="card flex flex-col gap-3">
  <h2 class="font-semibold">Reminders</h2>
  <label class="flex-row items-center justify-between font-normal">
    Period expected in 2 days
    <input
      type="checkbox"
      checked={user.remind_period}
      onchange={(e) => update({ remind_period: e.currentTarget.checked })}
    />
  </label>
  <label class="flex-row items-center justify-between font-normal">
    Fertile window starts
    <input
      type="checkbox"
      checked={user.remind_fertile}
      onchange={(e) => update({ remind_fertile: e.currentTarget.checked })}
    />
  </label>
  <label class="flex-row items-center justify-between font-normal">
    Pill, at 21:00 if not logged yet
    <input
      type="checkbox"
      checked={user.remind_pill}
      onchange={(e) => update({ remind_pill: e.currentTarget.checked })}
    />
  </label>
  <p class="text-sm text-zinc-500">
    Period and fertile reminders come at 9:00, on devices with notifications turned on.
  </p>
</section>

<Notifications />

{#if badge.supported}
  <section class="card flex flex-col gap-3">
    <label class="flex-row items-center justify-between font-normal">
      Show the day of your cycle on the app icon
      <input
        type="checkbox"
        checked={badge.on}
        onchange={(e) => badge.set(e.currentTarget.checked)}
      />
    </label>
    <p class="text-sm text-zinc-500">
      Only on this device. It updates when you open Flowy. On iPhone, turn notifications on too.
    </p>
  </section>
{/if}

<PartnerShare />

<section class="card flex flex-col gap-3">
  <div>
    <h2 class="font-semibold">Your data</h2>
    <p class="text-sm text-zinc-500">
      Download everything you logged as a spreadsheet, or bring in days exported from another app
      (CSV or JSON with a date on each row).
    </p>
  </div>
  <div class="flex gap-3">
    <button class="btn-secondary flex-1" onclick={() => download(exportCsv(tracker.logs.values()))}
      >Export</button
    >
    <label class="btn-secondary flex-1 cursor-pointer text-center"
      >Import<input
        class="sr-only"
        type="file"
        accept=".csv,.tsv,.txt,.json,text/csv,application/json"
        onchange={pick}
      /></label
    >
  </div>
  {#if importing}
    {@const d = importing.days}
    <div class="flex flex-col gap-3 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
      <p>
        Found {d.length}
        {d.length === 1 ? 'day' : 'days'} from {shortDate(d[0].date)} to {shortDate(
          d[d.length - 1].date,
        )}, {d.filter((l) => isBleeding(l.flow)).length} of them period days.
        {#if importing.skipped}{importing.skipped} rows had no date Flowy could read.{/if}
        Days you already logged keep what's there; the file only fills in the gaps.
      </p>
      <div class="flex gap-3">
        <button class="btn-primary flex-1" onclick={confirmImport}>Import</button>
        <button class="btn-secondary flex-1" onclick={() => (importing = null)}>Cancel</button>
      </div>
    </div>
  {/if}
  {#if importMessage}<p class="text-sm text-zinc-500" role="status">{importMessage}</p>{/if}
</section>

{#if install.canPrompt}
  <section class="card flex items-center justify-between gap-4">
    <p>Install Flowy for quick access from your home screen.</p>
    <button class="btn-primary shrink-0" onclick={() => install.install()}>Install</button>
  </section>
{:else if install.needsIosSteps}
  <section class="card">
    <p>To install Flowy, tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</p>
  </section>
{/if}

<section class="card flex flex-col gap-3 text-sm">
  <div class="flex items-center justify-between gap-4">
    <p class="text-zinc-600 dark:text-zinc-400">
      Signed in as {user.name || user.email}{session.isOwner ? ' (owner)' : ''}.
    </p>
    <button class="btn-secondary shrink-0 px-3 py-2 text-sm" onclick={signOut}>Sign out</button>
  </div>
  {#if tracker.unsynced}
    <p class="text-amber-700 dark:text-amber-300">
      {tracker.unsynced} logged {tracker.unsynced === 1 ? 'day is' : 'days are'} only on this phone so
      far. Signing out now would lose {tracker.unsynced === 1 ? 'it' : 'them'}.
    </p>
  {/if}
  {#if session.isOwner}
    <p class="text-zinc-600 dark:text-zinc-400">
      Add people and manage data in the <a
        class="text-brand-600 underline dark:text-brand-400"
        href="/_/">admin page</a
      >. In the app, each person only sees their own calendar.
    </p>
  {/if}
</section>

{#await version then v}
  {#if v}<p class="text-center text-xs text-zinc-400">Flowy {v}</p>{/if}
{/await}
