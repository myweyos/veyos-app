import { Injectable, Logger } from "@nestjs/common";

/**
 * Deletes the auth account at Supabase once the subject's data is erased (SCRUM-76 AC).
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY, which is a server-only secret that bypasses row-level
 * security. It must never be shipped to the app, and it never leaves this class.
 */
@Injectable()
export class SupabaseAdminClient {
  private readonly log = new Logger(SupabaseAdminClient.name);
  private readonly url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  get configured(): boolean {
    return Boolean(this.url) && Boolean(this.serviceKey);
  }

  /** Returns true if the account is gone (deleted now, or already absent). */
  async deleteUser(authUserId: string): Promise<boolean> {
    if (!this.configured) return false;
    const response = await fetch(`${this.url}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "DELETE",
      headers: {
        apikey: this.serviceKey as string,
        authorization: `Bearer ${this.serviceKey as string}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok || response.status === 404) return true;
    this.log.error(`auth account deletion failed: status=${response.status}`);
    return false;
  }
}
