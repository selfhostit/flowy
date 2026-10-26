import { DeviceCopy } from './offline';
import { pb, type User } from './pb';
import { forgetPush, syncPush } from './push';

// Who is signed in. PocketBase keeps the token in localStorage, so a reload or
// reopening the app keeps you signed in.
class Session {
  user = $state<User | null>(current());

  constructor() {
    // a login that ran out while the app was closed
    if (!pb.authStore.isValid) this.expire();
    pb.authStore.onChange(() => (this.user = current()));
  }

  get isOwner() {
    return this.user?.role === 'owner';
  }

  async login(email: string, password: string) {
    await pb.collection('users').authWithPassword(email.trim().toLowerCase(), password);
  }

  /** Signs out, and stops this device's notifications for the user. */
  async logout() {
    await forgetPush();
    pb.authStore.clear();
  }

  /** Checks the saved token is still valid and refreshes the user's details. */
  async refresh() {
    if (!pb.authStore.isValid) return this.expire();
    try {
      await pb.collection('users').authRefresh();
      await syncPush();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) this.expire();
    }
  }

  /**
   * Ends a login that ran out, or was signed out from another device. The copy of
   * the logs on this device goes with it; changes not sent yet stay, and are sent
   * when the same person signs in again.
   */
  private expire() {
    const id = pb.authStore.record?.id;
    if (id) new DeviceCopy(id).forgetSynced();
    pb.authStore.clear();
  }
}

function current(): User | null {
  return pb.authStore.isValid ? (pb.authStore.record as User) : null;
}

export const session = new Session();
