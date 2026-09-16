import { Inject, Injectable } from "@nestjs/common";
import type { Answers } from "@weyos/phenotype";
import type { Sql } from "postgres";

import { DB_POOL } from "../database/database.provider";

export interface BaselineSubmission {
  instrument: string;
  instrument_version: string;
  answers: Answers;
  energy_dip_at: string | null; // "HH:MM"
  corrected_fragment: string | null;
  submitted_at: string;
}

export interface IdentityAnswers {
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  waist_cm: number | null;
  usual_wake_time: string | null;
  usual_sleep_time: string | null;
  fixed_start: "no" | "some" | "yes" | null;
  work_pattern: "fixed" | "flexible" | "shift" | "self-directed" | null;
}

const IDENTITY_KEYS: ReadonlyArray<keyof IdentityAnswers> = [
  "date_of_birth", "height_cm", "weight_kg", "waist_cm",
  "usual_wake_time", "usual_sleep_time", "fixed_start", "work_pattern",
];

/** Baseline answers (append-only) and the Module A identity questions on the subject row. */
@Injectable()
export class BaselineRepository {
  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  async latest(subjectRef: string): Promise<BaselineSubmission | null> {
    const rows = await this.sql<BaselineSubmission[]>`
      SELECT instrument, instrument_version, answers, energy_dip_at::text AS energy_dip_at,
             corrected_fragment, submitted_at::text AS submitted_at
      FROM baseline_submissions
      WHERE subject_ref = ${subjectRef}
      ORDER BY submitted_at DESC, id DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async submit(
    subjectRef: string,
    submission: Omit<BaselineSubmission, "submitted_at">,
  ): Promise<void> {
    await this.sql`
      INSERT INTO baseline_submissions
        (subject_ref, instrument, instrument_version, answers, energy_dip_at, corrected_fragment)
      VALUES (
        ${subjectRef}, ${submission.instrument}, ${submission.instrument_version},
        ${this.sql.json(submission.answers)}, ${submission.energy_dip_at},
        ${submission.corrected_fragment}
      )
    `;
  }

  async identity(subjectRef: string): Promise<IdentityAnswers> {
    const rows = await this.sql<IdentityAnswers[]>`
      SELECT date_of_birth::text AS date_of_birth, height_cm, weight_kg::float AS weight_kg,
             waist_cm::float AS waist_cm, usual_wake_time::text AS usual_wake_time,
             usual_sleep_time::text AS usual_sleep_time, fixed_start, work_pattern
      FROM subjects WHERE subject_ref = ${subjectRef}
    `;
    const row = rows[0];
    return Object.fromEntries(IDENTITY_KEYS.map((k) => [k, row?.[k] ?? null])) as unknown as IdentityAnswers;
  }

  /** Update the given identity fields. A waist value also lands in the measurement history. */
  async updateIdentity(subjectRef: string, patch: Partial<IdentityAnswers>, today: string): Promise<void> {
    const present = IDENTITY_KEYS.filter((k) => patch[k] !== undefined);
    if (present.length === 0) return;
    const values = Object.fromEntries(present.map((k) => [k, patch[k]]));
    await this.sql`UPDATE subjects SET ${this.sql(values)}, updated_at = now() WHERE subject_ref = ${subjectRef}`;
    if (patch.waist_cm !== undefined && patch.waist_cm !== null) {
      await this.sql`
        INSERT INTO waist_measurements (subject_ref, waist_cm, measured_on)
        VALUES (${subjectRef}, ${patch.waist_cm}, ${today})
      `;
    }
  }

  async waistHistory(subjectRef: string): Promise<Array<{ measured_on: string; waist_cm: number }>> {
    return this.sql<Array<{ measured_on: string; waist_cm: number }>>`
      SELECT measured_on::text AS measured_on, waist_cm::float AS waist_cm
      FROM waist_measurements
      WHERE subject_ref = ${subjectRef}
      ORDER BY measured_on ASC, id ASC
    `;
  }
}
