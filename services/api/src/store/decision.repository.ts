import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";
import type { Sql } from "postgres";

import { DB_POOL } from "../database/database.provider";

/**
 * Persists and retrieves DecisionEnvelope rows from the decisions hypertable.
 *
 * The full envelope is stored as JSONB. decision_id is content-addressed (ADR 0006) and
 * safe to log; envelope column values are not — they contain decision text derived from
 * health data. Logging rule: ids and durations only.
 */
@Injectable()
export class DecisionRepository {
  private readonly log = new Logger(DecisionRepository.name);

  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  /**
   * Persist a decision envelope — idempotent.
   *
   * TimescaleDB requires any UNIQUE index to include the partition column (created_at), so a
   * standalone unique constraint on decision_id cannot be created. Idempotency is enforced
   * here: check for an existing row first and skip the insert if found.
   *
   * decision_id is content-addressed (sha256 over canonical decision JSON, first 16 hex chars,
   * computed once in Python per ADR 0006). A retried turn that produces the same decision
   * generates the same id and is therefore a safe no-op.
   */
  async save(envelope: DecisionEnvelope): Promise<void> {
    const start = Date.now();
    const existing = await this.sql<{ decision_id: string }[]>`
      SELECT decision_id FROM decisions WHERE decision_id = ${envelope.decision_id} LIMIT 1
    `;
    if (existing.length > 0) {
      this.log.log(`decision already exists, skipping: id=${envelope.decision_id}`);
      return;
    }
    await this.sql`
      INSERT INTO decisions (decision_id, subject_ref, as_of, envelope)
      VALUES (
        ${envelope.decision_id},
        ${envelope.decision.subject_ref},
        ${envelope.decision.as_of},
        ${envelope as any}::jsonb
      )
    `;
    this.log.log(`decision saved: id=${envelope.decision_id} duration=${Date.now() - start}ms`);
  }

  /**
   * Retrieve a decision envelope by id.
   *
   * Returns null — not throws — when not found. The caller decides the 404 policy.
   */
  async findById(decisionId: string): Promise<DecisionEnvelope | null> {
    const rows = await this.sql<{ envelope: DecisionEnvelope }[]>`
      SELECT envelope
      FROM decisions
      WHERE decision_id = ${decisionId}
      LIMIT 1
    `;
    return rows[0]?.envelope ?? null;
  }
}
