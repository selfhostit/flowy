<script lang="ts">
  import { onMount } from 'svelte';
  import { badge } from '../lib/badge.svelte';
  import { cycleDay, toIso } from '../lib/cycle';
  import { tracker } from '../lib/tracker.svelte';
  import Calendar from './Calendar.svelte';
  import DayLogSheet from './DayLogSheet.svelte';
  import Insights from './Insights.svelte';
  import Settings from './Settings.svelte';
  import Today from './Today.svelte';

  // The signed-in app: four tabs, each with its own #address so Back works.
  const tabs = [
    {
      id: 'today',
      label: 'Today',
      icon: 'M12 3.5c-2.9 3.6-6.5 7.9-6.5 11.4a6.5 6.5 0 0 0 13 0c0-3.5-3.6-7.8-6.5-11.4Z',
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: 'M7 3v3m10-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z',
    },
    { id: 'insights', label: 'Insights', icon: 'M5 20V12m7 8V5m7 15v-6' },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'M4 7h10m4 0h2M4 17h2m4 0h10M16 4.5v5M8 14.5v5',
    },
  ] as const;
  type Tab = (typeof tabs)[number]['id'];

  const fromHash = (): Tab => tabs.find((t) => `#${t.id}` === location.hash)?.id ?? 'today';
  let tab = $state<Tab>(fromHash());
  let logging = $state<string | null>(null);
  const log = (date: string) => (logging = date);

  // #log, from the icon's long-press menu, opens today's log on the Today tab
  function logFromHash() {
    if (location.hash !== '#log') return;
    history.replaceState(null, '', '#today');
    tab = 'today';
    log(toIso(tracker.now));
  }

  // the day of the cycle on the app's icon, kept current while the app is open
  $effect(() => {
    badge.show(tracker.loaded ? cycleDay(tracker.analysis, tracker.now) : null);
  });

  onMount(() => {
    tracker.load();
    logFromHash();
    const onHash = () => {
      tab = fromHash();
      logFromHash();
    };
    addEventListener('hashchange', onHash);
    return () => {
      removeEventListener('hashchange', onHash);
      badge.show(null);
    };
  });
</script>

<div class="mx-auto min-h-dvh max-w-md">
  <main class="flex flex-col gap-4 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28">
    {#if tracker.error}
      <section class="card flex items-center justify-between gap-4" role="alert">
        <p>{tracker.error}</p>
        <button class="btn-secondary shrink-0" onclick={() => tracker.load()}>Try again</button>
      </section>
    {/if}
    {#if tracker.offline || tracker.unsynced}
      <p
        class="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        role="status"
      >
        {tracker.offline
          ? "Can't reach your server. If you reach it over a VPN like Tailscale, check that it's on. "
          : ''}{tracker.unsynced
          ? `${tracker.unsynced} ${tracker.unsynced === 1 ? 'day' : 'days'} saved on this phone, sent when you're back online.`
          : 'Showing what is saved on this phone.'}
      </p>
    {/if}
    {#if tab === 'today'}
      <Today onlog={log} />
    {:else if tab === 'calendar'}
      <Calendar onlog={log} />
    {:else if tab === 'insights'}
      <Insights />
    {:else}
      <Settings />
    {/if}
  </main>

  <nav
    class="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90"
  >
    <div class="mx-auto grid max-w-md grid-cols-4">
      {#each tabs as t (t.id)}
        <a
          href="#{t.id}"
          class="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium {tab === t.id
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-zinc-500'}"
          aria-current={tab === t.id ? 'page' : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            class="size-6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"><path d={t.icon} /></svg
          >
          {t.label}
        </a>
      {/each}
    </div>
  </nav>

  {#if logging}
    {#key logging}
      <DayLogSheet date={logging} onclose={() => (logging = null)} />
    {/key}
  {/if}
</div>
