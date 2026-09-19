import { Inject, Injectable } from "@nestjs/common";
import type { T2Answer } from "@weyos/phenotype";
import type { Sql } from "postgres";

import { DB_POOL } from "../database/database.provider";

/** T2 answers (migration 0008): current answer per item, and appends. */
@Injectable()
export class T2Repository {
  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  async current(subjectRef: string): Promise<Record<string, T2Answer>> {
    const rows = await this.sql<{ item_id: string; answer: T2Answer }[]>`
      SELECT DISTINCT ON (item_id) item_id, answer
      FROM t2_answers
      WHERE subject_ref = ${subjectRef}
      ORDER BY item_id, answered_at DESC, id DESC
    `;
    return Object.fromEntries(rows.map((r) => [r.item_id, r.answer]));
  }

  async record(
    subjectRef: string,
    instrument: string,
    version: string,
    answers: Record<string, T2Answer>,
  ): Promise<void> {
    for (const [itemId, answer] of Object.entries(answers)) {
      await this.sql`
        INSERT INTO t2_answers (subject_ref, instrument, instrument_version, item_id, answer)
        VALUES (${subjectRef}, ${instrument}, ${version}, ${itemId}, ${this.sql.json(answer as never)})
      `;
    }
  }

  /** When the subject's account was created. The T2 surface unlocks a week later. */
  async subjectCreatedAt(subjectRef: string): Promise<string | null> {
    const rows = await this.sql<{ created_at: string }[]>`
      SELECT created_at::text AS created_at FROM subjects WHERE subject_ref = ${subjectRef}
    `;
    return rows[0]?.created_at ?? null;
  }
}
