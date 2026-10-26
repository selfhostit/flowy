<script lang="ts">
  import { lock } from '../lib/lock.svelte';
  import { DeviceCopy } from '../lib/offline';
  import { session } from '../lib/session.svelte';
  import { tracker } from '../lib/tracker.svelte';
  import Brand from './Brand.svelte';

  // Shown instead of the app while it's locked with a PIN (see lock.svelte.ts).
  let pin = $state('');
  let busy = $state(false);
  let error = $state('');
  let forgot = $state(false);

  const unsent = $derived(
    session.user ? Object.keys(new DeviceCopy(session.user.id).pending()).length : 0,
  );

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    if (!(await lock.unlock(pin))) {
      error =
        Date.now() < lock.waitUntil
          ? 'Too many wrong PINs. Try again in 30 seconds.'
          : 'Wrong PIN.';
    }
    pin = '';
    busy = false;
  }

  function signOut() {
    tracker.forget();
    lock.forget();
    session.logout();
  }
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
  <Brand title="Flowy" subtitle="Enter your PIN to continue." />
  <form class="flex flex-col gap-4" onsubmit={submit}>
    <label>
      PIN
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength="8"
        autofocus
        bind:value={pin}
        required
      />
    </label>
    {#if error}<p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>{/if}
    <button class="btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Unlock'}</button>
  </form>
  {#if forgot}
    <div class="mt-6 flex flex-col gap-3 text-sm">
      <p class="text-zinc-600 dark:text-zinc-400">
        Sign out to remove the PIN and Flowy's data from this device. Your logs are kept on the
        server, so they come back when you sign in again.
      </p>
      {#if unsent}
        <p class="text-amber-700 dark:text-amber-300">
          {unsent} logged {unsent === 1 ? 'day has' : 'days have'} not reached the server yet and would
          be lost.
        </p>
      {/if}
      <button class="btn-secondary" onclick={signOut}>Sign out</button>
    </div>
  {:else}
    <button class="mt-6 text-sm text-zinc-500 underline" onclick={() => (forgot = true)}
      >Forgot your PIN?</button
    >
  {/if}
</main>
