<script lang="ts">
  import { errorMessage, pb } from '../lib/pb';
  import { session } from '../lib/session.svelte';

  const user = $derived(session.user!);

  let open = $state(false);
  let current = $state('');
  let password = $state('');
  let again = $state('');
  let busy = $state(false);
  let error = $state('');
  let done = $state(false);

  async function change(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (password !== again) {
      error = "The new passwords don't match.";
      return;
    }
    busy = true;
    try {
      await pb.collection('users').update(user.id, {
        oldPassword: current,
        password,
        passwordConfirm: again,
      });
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      error = data?.oldPassword
        ? 'Your current password is wrong.'
        : data?.password
          ? 'The new password needs at least 8 characters.'
          : errorMessage(err);
      busy = false;
      return;
    }
    // a new password signs out every device, this one too: sign in again with it
    try {
      await session.login(user.email, password);
      current = password = again = '';
      open = false;
      done = true;
    } catch {
      pb.authStore.clear();
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <form
    class="flex w-full flex-col gap-4 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800"
    onsubmit={change}
  >
    <label>
      Current password
      <input type="password" autocomplete="current-password" bind:value={current} required />
    </label>
    <label>
      New password
      <input
        type="password"
        autocomplete="new-password"
        bind:value={password}
        required
        minlength="8"
        placeholder="At least 8 characters"
      />
    </label>
    <label>
      New password again
      <input
        type="password"
        autocomplete="new-password"
        bind:value={again}
        required
        minlength="8"
      />
    </label>
    <p class="text-zinc-500">
      Your other phones and computers are signed out and need the new password.{session.isOwner
        ? " This doesn't change your password for the admin page."
        : ''}
    </p>
    {#if error}<p class="text-red-600 dark:text-red-400" role="alert">{error}</p>{/if}
    <div class="flex gap-3">
      <button class="btn-primary flex-1" disabled={busy}
        >{busy ? 'Saving…' : 'Save password'}</button
      >
      <button type="button" class="btn-secondary flex-1" onclick={() => (open = false)}
        >Cancel</button
      >
    </div>
  </form>
{:else}
  <button
    class="btn-secondary px-3 py-2 text-sm"
    onclick={() => ((open = true), (done = false), (error = ''))}>Change password</button
  >
{/if}
{#if done}<p class="w-full text-zinc-500" role="status">Your password is changed.</p>{/if}
