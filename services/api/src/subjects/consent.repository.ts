import { Inject, Injectable } from "@nestjs/common";
import type { Sql } from "postgres";

import { DB_POOL } from "../database/database.provider";

/** The six A4 purposes. The two agent consents (voice, conversation) arrive with the agent. */
export const PURPOSES = [
  "health_data",
  "cycle_data",
  "lab_results",
  "location_environment",
  "notifications",
  "product_analytics",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export type ConsentState = Record<Purpose, boolean>;

/**
 * Consent decisions, append-only (migration 0006).
 *
 * A purpose never recorded reads as NOT granted. Nothing is on by default at the storage layer.
 */
@Injectable()
export class ConsentRepository {
  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  async current(subjectRef: string): Promise<ConsentState> {
    const rows = await this.sql<{ purpose: Purpose; granted: boolean }[]>`
      SELECT DISTINCT ON (purpose) purpose, granted
      FROM consents
      WHERE subject_ref = ${subjectRef}
      ORDER BY purpose, recorded_at DESC, id DESC
    `;
    const state = Object.fromEntries(PURPOSES.map((p) => [p, false])) as ConsentState;
    for (const row of rows) state[row.purpose] = row.granted;
    return state;
  }

  /** Record the purposes that changed. Unchanged purposes are not re-recorded. */
  async record(
    subjectRef: string,
    decisions: Partial<ConsentState>,
    copyVersion: string,
  ): Promise<ConsentState> {
    const before = await this.current(subjectRef);
    const changed = PURPOSES.filter(
      (p) => decisions[p] !== undefined && decisions[p] !== before[p],
    );
    for (const purpose of changed) {
      await this.sql`
        INSERT INTO consents (subject_ref, purpose, granted, copy_version)
        VALUES (${subjectRef}, ${purpose}, ${decisions[purpose] as boolean}, ${copyVersion})
      `;
    }
    return { ...before, ...Object.fromEntries(changed.map((p) => [p, decisions[p]])) };
  }
}
