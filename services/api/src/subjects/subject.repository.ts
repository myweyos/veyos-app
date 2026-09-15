import { randomBytes } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Sql } from "postgres";

import { DB_POOL } from "../database/database.provider";

export type Dosha = "vata" | "pitta" | "kapha";
export type Region = "UK" | "US";

export interface Profile {
  region: Region | null;
  constitution: { dosha: Dosha } | null;
}

/**
 * Account → pseudonymous subject_ref, plus the profile answers (SCRUM-76).
 *
 * LOGGING: subject_refs are pseudonymous and safe to log truncated. Never log auth user ids,
 * which link to an email address at the auth provider.
 */
@Injectable()
export class SubjectRepository {
  private readonly log = new Logger(SubjectRepository.name);

  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  /**
   * The subject_ref for this account, created on first sight.
   *
   * Race-safe: two first requests from a new account (the app often fires several at once) both
   * try to insert, the unique constraint on auth_user_id lets exactly one win, and both read the
   * winner back.
   */
  async resolveOrCreate(authUserId: string): Promise<string> {
    const candidate = `sub_${randomBytes(12).toString("hex")}`;
    await this.sql`
      INSERT INTO subjects (subject_ref, auth_user_id)
      VALUES (${candidate}, ${authUserId})
      ON CONFLICT (auth_user_id) DO NOTHING
    `;
    const rows = await this.sql<{ subject_ref: string }[]>`
      SELECT subject_ref FROM subjects WHERE auth_user_id = ${authUserId}
    `;
    const subjectRef = rows[0]?.subject_ref;
    if (subjectRef === undefined) throw new Error("subject row missing immediately after upsert");
    return subjectRef;
  }

  async profile(subjectRef: string): Promise<Profile> {
    const rows = await this.sql<{ region: Region | null; constitution_dosha: Dosha | null }[]>`
      SELECT region, constitution_dosha FROM subjects WHERE subject_ref = ${subjectRef}
    `;
    const row = rows[0];
    return {
      region: row?.region ?? null,
      constitution: row?.constitution_dosha ? { dosha: row.constitution_dosha } : null,
    };
  }

  async updateProfile(
    subjectRef: string,
    patch: { region?: Region; dosha?: Dosha },
  ): Promise<Profile> {
    await this.sql`
      UPDATE subjects SET
        region = COALESCE(${patch.region ?? null}, region),
        constitution_dosha = COALESCE(${patch.dosha ?? null}, constitution_dosha),
        updated_at = now()
      WHERE subject_ref = ${subjectRef}
    `;
    return this.profile(subjectRef);
  }

  /**
   * Erase everything held for a subject, in one transaction (SCRUM-76 AC: account deletion
   * cascades). Snapshots and decisions first, the subject row last, so a failure part-way
   * leaves the account able to retry rather than orphaning health data with no owner.
   */
  async eraseSubject(subjectRef: string): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM signal_snapshots WHERE subject_ref = ${subjectRef}`;
      await tx`DELETE FROM decisions WHERE subject_ref = ${subjectRef}`;
      await tx`DELETE FROM subjects WHERE subject_ref = ${subjectRef}`;
    });
    this.log.log(`subject erased: ${subjectRef.slice(0, 8)}…`);
  }
}
