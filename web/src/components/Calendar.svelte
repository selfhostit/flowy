<script lang="ts">
  import { toDay, toIso, type Day } from '../lib/cycle';
  import { formatDay } from '../lib/format';
  import { tracker } from '../lib/tracker.svelte';
  import DayDot from './DayDot.svelte';

  let { onlog }: { onlog: (date: string) => void } = $props();

  // the month on screen, as its first day; #calendar/2026-03 opens on March 2026
  const asked = /^#calendar\/(\d{4}-\d{2})$/.exec(location.hash)?.[1];
  let month = $state(asked ? toDay(asked + '-01') : firstOfMonth(tracker.now));
  // in edit mode a tap marks or unmarks a period day instead of opening the log
  let editing = $state(false);
  let error = $state('');

  function firstOfMonth(day: Day): Day {
    return toDay(toIso(day).slice(0, 8) + '01');
  }

  function shift(months: number) {
    const [y, m] = toIso(month).split('-').map(Number);
    month = toDay(new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10));
  }

  // weeks start on Monday; the grid shows whole weeks around the month
  const cells = $derived.by(() => {
    const weekday = (new Date(month * 86_400_000).getUTCDay() + 6) % 7;
    const start = month - weekday;
    const next = firstOfMonth(month + 31);
    const count = Math.ceil((next - start) / 7) * 7;
    return Array.from({ length: count }, (_, i) => start + i);
  });
  const nextMonth = $derived(firstOfMonth(month + 31));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    formatDay(toDay('2024-01-01') + i, { weekday: 'narrow' }),
  );

  async function tap(day: Day) {
    if (!editing) return onlog(toIso(day));
    if (day > tracker.now) return;
    error = '';
    try {
      await tracker.togglePeriod(toIso(day));
    } catch {
      error = 'Could not save. Please try again.';
    }
  }

  let startX = 0;
  const swipeStart = (e: TouchEvent) => (startX = e.touches[0].clientX);
  function swipeEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 60) shift(dx < 0 ? 1 : -1);
  }
</script>

<header class="flex items-center justify-between">
  <button class="btn-secondary size-10 p-0" aria-label="Previous month" onclick={() => shift(-1)}
    >‹</button
  >
  <h1 class="text-xl font-bold">{formatDay(month, { month: 'long', year: 'numeric' })}</h1>
  <button class="btn-secondary size-10 p-0" aria-label="Next month" onclick={() => shift(1)}
    >›</button
  >
</header>

<section
  class="card px-3"
  role="group"
  aria-label="Month"
  ontouchstart={swipeStart}
  ontouchend={swipeEnd}
>
  <div class="grid grid-cols-7 gap-y-2 text-center">
    {#each weekdays as w, i (i)}<span class="text-xs font-semibold text-zinc-400">{w}</span>{/each}
    {#each cells as d (d)}
      <button
        class="flex justify-center disabled:cursor-not-allowed"
        onclick={() => tap(d)}
        disabled={editing && d > tracker.now}
        aria-label={formatDay(d, { weekday: 'long', month: 'long', day: 'numeric' })}
      >
        <DayDot day={d} today={d === tracker.now} dim={d < month || d >= nextMonth} />
      </button>
    {/each}
  </div>
</section>

<div class="flex gap-2">
  <button
    class="{editing ? 'btn-primary' : 'btn-secondary'} flex-1"
    onclick={() => (editing = !editing)}
  >
    {editing ? 'Done' : 'Edit period days'}
  </button>
  <button class="btn-secondary" onclick={() => (month = firstOfMonth(tracker.now))}>Today</button>
</div>
{#if editing}
  <p class="text-center text-sm text-zinc-500">Tap the days you had your period.</p>
{/if}
{#if error}<p class="text-center text-sm text-red-600" role="alert">{error}</p>{/if}

<section class="card grid grid-cols-2 gap-3 text-sm">
  <span class="flex items-center gap-2"
    ><span class="size-4 rounded-full bg-brand-500"></span> Period</span
  >
  <span class="flex items-center gap-2"
    ><span class="size-4 rounded-full border-2 border-dashed border-brand-400"></span> Predicted period</span
  >
  <span class="flex items-center gap-2"
    ><span class="size-4 rounded-full bg-fertile-100 dark:bg-fertile-500/20"></span> Fertile window</span
  >
  <span class="flex items-center gap-2"
    ><span class="size-4 rounded-full bg-fertile-500"></span> Ovulation</span
  >
</section>
