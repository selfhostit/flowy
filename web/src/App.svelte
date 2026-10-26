<script lang="ts">
  import { onMount } from 'svelte';
  import { lock } from './lib/lock.svelte';
  import { errorMessage, pb } from './lib/pb';
  import { session } from './lib/session.svelte';
  import Home from './components/Home.svelte';
  import Lock from './components/Lock.svelte';
  import Login from './components/Login.svelte';
  import Partner from './components/Partner.svelte';
  import Setup from './components/Setup.svelte';

  // Signed-out visitors see the setup screen on a new install, the sign-in form otherwise.
  // Anyone already signed in means setup is done.
  let setupNeeded = $state<boolean | null>(session.user ? false : null);
  let error = $state('');

  // a partner's share link works whether or not anyone is signed in
  const partnerToken = () => location.hash.match(/^#partner\/([a-z0-9]+)$/)?.[1] ?? '';
  let partner = $state(partnerToken());

  async function checkSetup() {
    error = '';
    try {
      setupNeeded = (await pb.send<{ needed: boolean }>('/api/app/setup', {})).needed;
    } catch (err) {
      error = errorMessage(err);
    }
  }

  onMount(() => {
    const start = () => {
      if (partner) return;
      if (session.user) session.refresh();
      else if (setupNeeded === null) checkSetup();
    };
    addEventListener('hashchange', () => {
      partner = partnerToken();
      start();
    });
    start();
  });
</script>

{#if partner}
  <Partner token={partner} />
{:else if session.user && lock.locked}
  <Lock />
{:else if session.user}
  <Home />
{:else if error}
  <main class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6">
    <p class="text-center" role="alert">{error}</p>
    <button class="btn-secondary" onclick={checkSetup}>Try again</button>
  </main>
{:else if setupNeeded}
  <Setup />
{:else if setupNeeded === false}
  <Login />
{/if}
