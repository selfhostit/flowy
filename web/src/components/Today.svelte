<script lang="ts">
  import { cycleDay, cyclePhase, pregnancyChance, toIso, type Day } from '../lib/cycle';
  import { days, formatDay } from '../lib/format';
  import { moods, symptoms } from '../lib/log';
  import { tracker } from '../lib/tracker.svelte';
  import Cat from './Cat.svelte';
  import CycleChart from './CycleChart.svelte';
  import DayDot from './DayDot.svelte';

  let { onlog }: { onlog: (date: string) => void } = $props();

  const a = $derived(tracker.analysis);
  const now = $derived(tracker.now);
  const todayIso = $derived(toIso(now));
  const todayLog = $derived(tracker.logs.get(todayIso));
  const nextOvulation = $derived(a.ovulations.find((o) => o >= now));
  const chance = $derived(pregnancyChance(a, now));
  const phase = $derived(tracker.phases.get(now));
  const week = $derived(Array.from({ length: 7 }, (_, i) => now - 3 + i));

  // what the big circle says
  const status = $derived.by(() => {
    if (!a.nextStart) {
      return {
        label: 'Welcome',
        big: 'Log your period',
        small: 'Flowy learns your cycle as you go.',
      };
    }
    if (a.current) {
      const left = a.current.end - now;
      return {
        label: 'Period',
        big: `Day ${now - a.current.start + 1}`,
        small: left > 0 ? `About ${days(left)} to go` : 'Expected to end today',
      };
    }
    const date = (d: Day) => formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' });
    // cycles vary, so a period a few days after the expected day isn't late yet
    if (a.late && a.late <= a.margin)
      return {
        label: 'Period due',
        big: 'Any day now',
        small: `Most likely by ${date(a.nextStart + a.margin)}`,
      };
    if (a.late)
      return { label: 'Period is late', big: days(a.late), small: 'It can start any day now.' };
    const until = a.nextStart - now;
    return {
      label: 'Period in',
      big: until === 0 ? 'Today' : until === 1 ? '1 day' : days(until),
      small: `Expected ${date(a.nextStart)} · ± ${days(a.margin)}`,
    };
  });

  const ovulationText = $derived.by(() => {
    if (nextOvulation === undefined) return '';
    const n = nextOvulation - now;
    if (n === 0) return 'Ovulation today';
    if (phase === 'fertile') return `Fertile window · ovulation in ${days(n)}`;
    return `Ovulation in ${days(n)}`;
  });

  const chanceStyle = {
    low: 'text-zinc-600 dark:text-zinc-300',
    medium: 'text-fertile-600',
    high: 'text-fertile-700 dark:text-fertile-500',
  };

  const tags = $derived([
    ...(todayLog?.symptoms ?? []).map((s) => symptoms.find((x) => x.value === s)),
    ...(todayLog?.custom_symptoms ?? []).map((s) => ({ ...s, value: s.label })),
    ...(todayLog?.moods ?? []).map((m) => moods.find((x) => x.value === m)),
  ]);

  let busy = $state(false);
  async function togglePeriodToday() {
    busy = true;
    try {
      await tracker.togglePeriod(todayIso);
    } finally {
      busy = false;
    }
  }

  const fertileNow = $derived(phase === 'fertile' || phase === 'ovulation');
  const periodNow = $derived(!!a.current);
  const phaseNow = $derived(cyclePhase(a, now));
  const phaseInfo = {
    menstrual: {
      title: 'Menstrual phase',
      text: 'Energy can be lower. Rest, warmth and iron-rich food help.',
    },
    follicular: {
      title: 'Follicular phase',
      text: 'Estrogen rises and energy usually picks up. A good time for new plans and workouts.',
    },
    fertile: {
      title: 'Fertile window',
      text: 'The days around ovulation, when pregnancy is most likely.',
    },
    luteal: {
      title: 'Luteal phase',
      text: 'Progesterone rises. Cravings, bloating or mood changes can show up before your period.',
    },
  };
  const label = (d: Day) => formatDay(d, { weekday: 'narrow' });
</script>

<header class="flex items-center justify-between">
  <div class="flex items-center gap-2">
    <img src="/icons/icon.svg" alt="" class="size-8" />
    <h1 class="text-xl font-bold tracking-tight">Flowy</h1>
  </div>
  <p class="text-sm text-zinc-500">
    {formatDay(now, { weekday: 'long', month: 'long', day: 'numeric' })}
  </p>
</header>

<!-- this week, with today in the middle -->
<div class="grid grid-cols-7 gap-1 text-center">
  {#each week as d (d)}
    <button class="flex flex-col items-center gap-1" onclick={() => onlog(toIso(d))}>
      <span class="text-xs text-zinc-500 {d === now ? 'font-bold text-brand-600' : ''}"
        >{label(d)}</span
      >
      <DayDot day={d} today={d === now} />
    </button>
  {/each}
</div>

<section class="flex justify-center py-2">
  <div
    class="flex aspect-square w-72 flex-col items-center justify-center rounded-full p-8 text-center shadow-lg {periodNow
      ? 'bg-gradient-to-br from-rose-400 to-pink-600 text-white shadow-rose-500/30'
      : fertileNow
        ? 'bg-gradient-to-br from-teal-300 to-teal-600 text-white shadow-teal-500/30'
        : 'border-8 border-rose-100 bg-white shadow-rose-200/40 dark:border-rose-500/20 dark:bg-zinc-900 dark:shadow-none'}"
  >
    <p class="text-sm font-semibold tracking-wide uppercase opacity-80">{status.label}</p>
    <p class="my-1 text-4xl leading-tight font-bold">{status.big}</p>
    <p class="text-sm opacity-80">{status.small}</p>
    <button
      class="mt-4 rounded-full px-5 py-2 text-sm font-semibold shadow-sm transition {periodNow ||
      fertileNow
        ? 'bg-white text-rose-600'
        : 'bg-brand-500 text-white'}"
      disabled={busy}
      onclick={() => (periodNow ? onlog(todayIso) : togglePeriodToday())}
    >
      {periodNow ? 'Log today' : 'Period started today'}
    </button>
  </div>
</section>

<div class="grid grid-cols-2 gap-3">
  <section class="card p-4">
    <p class="text-xs text-zinc-500">Cycle day</p>
    <p class="text-2xl font-bold">{cycleDay(a, now) ?? '–'}</p>
    {#if ovulationText}<p class="mt-1 text-xs text-fertile-600">{ovulationText}</p>{/if}
  </section>
  <section class="card p-4">
    <p class="text-xs text-zinc-500">Chance of pregnancy</p>
    <p class="text-2xl font-bold capitalize {chanceStyle[chance]}">{chance}</p>
    <p class="mt-1 text-xs text-zinc-500">from your fertile window</p>
  </section>
</div>

<CycleChart {onlog} />

<section class="card flex items-center gap-3 py-3 pl-2">
  <Cat phase={phaseNow} />
  <div class="relative rounded-2xl bg-brand-50 px-4 py-3 dark:bg-brand-500/10">
    <span
      class="absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rotate-45 bg-brand-50 dark:bg-brand-500/10"
    ></span>
    <h2 class="font-semibold">{phaseNow ? phaseInfo[phaseNow].title : 'Hi, I’m Mochi!'}</h2>
    <p class="text-sm text-zinc-600 dark:text-zinc-400">
      {phaseNow
        ? phaseInfo[phaseNow].text
        : 'Log your period and I’ll keep track of your cycle with you.'}
    </p>
  </div>
</section>

<section class="card flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <h2 class="font-semibold">Today's log</h2>
    <button
      class="text-sm font-semibold text-brand-600 dark:text-brand-400"
      onclick={() => onlog(todayIso)}
    >
      {todayLog ? 'Edit' : 'Add'}
    </button>
  </div>
  {#if todayLog}
    <div class="flex flex-wrap gap-2">
      {#if todayLog.flow}<span class="chip capitalize">🩸 {todayLog.flow}</span>{/if}
      {#each tags as t (t?.value)}
        {#if t}<span class="chip">{t.icon} {t.label}</span>{/if}
      {/each}
      {#if todayLog.sex}<span class="chip">❤️ Sex</span>{/if}
      {#if todayLog.pill}<span class="chip">💊 Pill</span>{/if}
      {#if todayLog.temperature}<span class="chip">🌡️ {todayLog.temperature}°</span>{/if}
      {#if todayLog.weight}<span class="chip">⚖️ {todayLog.weight}</span>{/if}
    </div>
    {#if todayLog.notes}<p class="text-sm text-zinc-600 dark:text-zinc-400">
        {todayLog.notes}
      </p>{/if}
  {:else}
    <p class="text-sm text-zinc-500">How are you feeling? Add symptoms, moods and notes.</p>
  {/if}
</section>

<p class="px-2 text-center text-xs text-zinc-400">
  Predictions are estimates from your logged cycles and are not a form of birth control.
</p>
