<script lang="ts">
  import {
    mostlyIn,
    stats,
    toDay,
    toIso,
    typicalLength,
    unusualBy,
    type CyclePhase,
    type Day,
  } from '../lib/cycle';
  import { days, formatDay } from '../lib/format';
  import { moods, symptoms } from '../lib/log';
  import { tracker } from '../lib/tracker.svelte';

  const a = $derived(tracker.analysis);
  // newest first, at most a year
  const cycles = $derived([...a.history].reverse().slice(0, 13));
  const longest = $derived(Math.max(35, ...cycles.map((c) => c.length)));
  const short = (d: number) => formatDay(d, { month: 'short', day: 'numeric' });
  const s = $derived(stats(a.history));
  const typical = $derived(typicalLength(a.history));
  const monthOf = (d: Day) => ({
    href: `#calendar/${toIso(d).slice(0, 7)}`,
    name: formatDay(d, { month: 'long' }),
  });

  // the last cycles as columns, oldest first, scaled between a little under the
  // shortest and a little over the longest so differences show
  const trend = $derived.by(() => {
    if (!s) return null;
    const recent = a.history.filter((c) => c.length >= 15 && c.length <= 60).slice(-12);
    const lo = Math.max(0, s.shortest - 6);
    const hi = s.longest + 2;
    const h = (n: number) => ((n - lo) / (hi - lo)) * 100;
    return { recent, h, avg: h(a.cycleLength) };
  });

  // the next periods and fertile windows
  const coming = $derived(
    a.predicted.slice(0, 3).map((p) => {
      const o = a.ovulations.find((o) => o > p.start - a.cycleLength && o < p.start);
      return { period: p, fertile: o === undefined ? null : { start: o - 5, end: o + 1 } };
    }),
  );
  const inDays = (d: Day) => {
    const n = d - tracker.now;
    return n <= 0 ? 'now' : n === 1 ? 'tomorrow' : `in ${days(n)}`;
  };

  const when: Record<CyclePhase, string> = {
    menstrual: 'mostly during your period',
    follicular: 'mostly after your period',
    fertile: 'mostly around ovulation',
    luteal: 'mostly in the days before your period',
  };

  // the most logged symptoms (your own too) or moods, and when in the cycle they show up
  function top(field: 'symptoms' | 'moods', labels: typeof symptoms) {
    const seen = new Map<string, { label: string; icon: string; days: Day[] }>();
    const add = (key: string, label: string, icon: string, day: Day) => {
      const item = seen.get(key) ?? { label, icon, days: [] };
      item.days.push(day);
      seen.set(key, item);
    };
    for (const l of tracker.logs.values()) {
      const day = toDay(l.date);
      for (const v of l[field] ?? []) {
        const known = labels.find((x) => x.value === v);
        if (known) add(v, known.label, known.icon, day);
      }
      if (field === 'symptoms') {
        for (const c of l.custom_symptoms ?? [])
          add(`own:${c.label.toLowerCase()}`, c.label, c.icon, day);
      }
    }
    return [...seen]
      .sort((x, y) => y[1].days.length - x[1].days.length)
      .slice(0, 5)
      .map(([value, item]) => {
        const phase = mostlyIn(a, item.days);
        return { value, ...item, count: item.days.length, when: phase ? when[phase] : '' };
      });
  }
  const topSymptoms = $derived(top('symptoms', symptoms));
  const topMoods = $derived(top('moods', moods));

  // the last 60 days of temperatures, for a small line chart
  const temps = $derived(
    [...tracker.logs.values()]
      .filter((l) => l.temperature && toDay(l.date) > tracker.now - 60)
      .map((l) => ({ day: toDay(l.date), t: l.temperature })),
  );
  const chart = $derived.by(() => {
    if (temps.length < 2) return null;
    const lo = Math.min(...temps.map((p) => p.t)) - 0.1;
    const hi = Math.max(...temps.map((p) => p.t)) + 0.1;
    const x = (d: number) => ((d - (tracker.now - 60)) / 60) * 300;
    const y = (t: number) => 100 - ((t - lo) / (hi - lo)) * 100;
    return {
      points: temps.map((p) => `${x(p.day).toFixed(1)},${y(p.t).toFixed(1)}`).join(' '),
      lo: lo + 0.1,
      hi: hi - 0.1,
    };
  });
</script>

<h1 class="text-2xl font-bold tracking-tight">Insights</h1>

<div class="grid grid-cols-3 gap-3 text-center">
  <section class="card p-3">
    <p class="text-2xl font-bold">{a.cycleLength}</p>
    <p class="text-xs text-zinc-500">day cycle</p>
  </section>
  <section class="card p-3">
    <p class="text-2xl font-bold text-brand-600 dark:text-brand-400">{a.periodLength}</p>
    <p class="text-xs text-zinc-500">day period</p>
  </section>
  <section class="card p-3">
    <p class="text-2xl font-bold">{a.periods.length}</p>
    <p class="text-xs text-zinc-500">periods logged</p>
  </section>
</div>
{#if !a.learned}
  <p class="px-1 text-sm text-zinc-500">
    These are your settings for now. After two logged periods, Flowy uses your own averages.
  </p>
{/if}

{#if s && trend}
  <section class="card flex flex-col gap-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold">How regular you are</h2>
        <p class="text-sm text-zinc-500">
          Your last {s.count} cycles · average {a.cycleLength} days
        </p>
      </div>
      <span
        class="rounded-full px-3 py-1 text-xs font-semibold {s.regular
          ? 'bg-fertile-100 text-fertile-700 dark:bg-fertile-500/20 dark:text-fertile-500'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}"
        >{s.regular ? 'Regular' : 'Irregular'}</span
      >
    </div>

    <div class="relative flex h-32 items-end gap-1.5" aria-hidden="true">
      <div
        class="absolute inset-x-0 border-t-2 border-dashed border-zinc-300 dark:border-zinc-600"
        style:bottom="{trend.avg}%"
      ></div>
      {#each trend.recent as c (c.start)}
        <div class="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span class="text-[10px] font-semibold text-zinc-500">{c.length}</span>
          <div
            class="w-full max-w-8 rounded-t-lg {c.length === s.shortest || c.length === s.longest
              ? 'bg-brand-500'
              : 'bg-brand-400/60'}"
            style:height="{trend.h(c.length)}%"
          ></div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl bg-zinc-50 py-2 dark:bg-zinc-800/60">
        <p class="text-lg font-bold">{s.shortest}</p>
        <p class="text-xs text-zinc-500">shortest</p>
      </div>
      <div class="rounded-xl bg-zinc-50 py-2 dark:bg-zinc-800/60">
        <p class="text-lg font-bold">{s.longest}</p>
        <p class="text-xs text-zinc-500">longest</p>
      </div>
      <div class="rounded-xl bg-zinc-50 py-2 dark:bg-zinc-800/60">
        <p class="text-lg font-bold">±{Math.ceil(s.spread / 2)}</p>
        <p class="text-xs text-zinc-500">days of variation</p>
      </div>
    </div>
    <p class="text-sm text-zinc-600 dark:text-zinc-400">
      {s.regular
        ? `Your cycles stay within ${days(s.spread)} of each other, so predictions should be close.`
        : `Your cycles vary by ${days(s.spread)}, so give predictions a few days either way. A big change from your usual is worth mentioning to a doctor.`}
      Periods last {s.shortestPeriod === s.longestPeriod
        ? days(s.shortestPeriod)
        : `${s.shortestPeriod} to ${s.longestPeriod} days`}.
    </p>
  </section>
{/if}

{#if coming.length}
  <section class="card flex flex-col gap-3">
    <h2 class="font-semibold">Coming up</h2>
    {#each coming as c, i (c.period.start)}
      <div
        class="flex flex-col gap-1.5 {i
          ? 'border-t border-zinc-100 pt-3 dark:border-zinc-800'
          : ''}"
      >
        {#if c.fertile && c.fertile.end >= tracker.now}
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="flex items-center gap-2"
              ><span class="size-2.5 rounded-full bg-fertile-500"></span>Fertile window</span
            >
            <span class="text-zinc-500"
              >{short(c.fertile.start)} – {short(c.fertile.end)} · {inDays(c.fertile.start)}</span
            >
          </div>
        {/if}
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="flex items-center gap-2 font-medium"
            ><span class="size-2.5 rounded-full bg-brand-500"></span>Period</span
          >
          <span class="text-zinc-500"
            >{short(c.period.start)} – {short(c.period.end)} · {inDays(c.period.start)}</span
          >
        </div>
      </div>
    {/each}
  </section>
{/if}

<section class="card flex flex-col gap-3">
  <h2 class="font-semibold">Cycle history</h2>
  {#if cycles.length}
    {#each cycles as c (c.start)}
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-sm">
          <span>{short(c.start)} – {short(c.start + c.length - 1)}</span>
          <span class="font-semibold">{c.length} days</span>
        </div>
        <div class="flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            class="h-full bg-zinc-200 dark:bg-zinc-700"
            style:width="{(c.length / longest) * 100}%"
          >
            <div
              class="h-full rounded-full bg-brand-500"
              style:width="{(c.periodLength / c.length) * 100}%"
            ></div>
          </div>
        </div>
        {#if typical && c.length - typical >= unusualBy}
          {@const m = monthOf(c.start + typical)}
          <p class="text-xs text-amber-700 dark:text-amber-300">
            Much longer than your usual {typical} days. If a period wasn't logged,
            <a class="underline" href={m.href}>add it in {m.name}</a>.
          </p>
        {:else if typical && typical - c.length >= unusualBy}
          {@const m = monthOf(c.start)}
          <p class="text-xs text-amber-700 dark:text-amber-300">
            Much shorter than your usual {typical} days. If spotting was logged as a period,
            <a class="underline" href={m.href}>check {m.name}</a>.
          </p>
        {/if}
      </div>
    {/each}
  {:else}
    <p class="text-sm text-zinc-500">Your cycles show up here once you've logged two periods.</p>
  {/if}
</section>

{#if chart}
  <section class="card flex flex-col gap-2">
    <h2 class="font-semibold">Temperature, last 60 days</h2>
    <svg viewBox="-4 -4 308 108" class="h-32 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={chart.points}
        fill="none"
        class="stroke-brand-500"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <p class="flex justify-between text-xs text-zinc-500">
      <span>Low {chart.lo.toFixed(2)}°</span><span>High {chart.hi.toFixed(2)}°</span>
    </p>
  </section>
{/if}

{#each [{ title: 'Most common symptoms', list: topSymptoms }, { title: 'Most common moods', list: topMoods }] as group (group.title)}
  {#if group.list.length}
    <section class="card flex flex-col gap-2">
      <h2 class="font-semibold">{group.title}</h2>
      {#each group.list as item (item.value)}
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="flex flex-col">
            <span>{item.icon} {item.label}</span>
            {#if item.when}<span class="text-xs text-zinc-500">{item.when}</span>{/if}
          </span>
          <span class="shrink-0 text-zinc-500">{days(item.count)}</span>
        </div>
      {/each}
    </section>
  {/if}
{/each}
