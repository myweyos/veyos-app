import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";

import { SchemaRegistry } from "./schema.registry";

const DEFAULT_URL = "http://127.0.0.1:8000";
/** The engine is sub-millisecond. Over a second means sick, not slow. */
const DEFAULT_TIMEOUT_MS = 1500;

/**
 * The seam ADR 0004 is really about.
 *
 * Today this speaks HTTP to the FastAPI sidecar. When the execution layer lands and ADR 0004
 * moves to option 2, this becomes a queue-backed implementation of the same interface and no
 * controller moves. That is the whole reason it is an injectable class rather than a bare
 * fetch call inside a controller.
 *
 * Uses Node 20's global fetch — zero new runtime dependencies. `@nestjs/axios` would add axios
 * plus rxjs interop for one call per request; undici directly buys pool control nobody needs.
 *
 * LOGGING DISCIPLINE. Method, path, status, duration, decision id, rulebook version. Never the
 * request body, never the response `warnings` (they interpolate `days_of_history` and
 * `cycle_day`), never a forwarded error body from the sidecar.
 */
@Injectable()
export class EngineClient {
  private readonly log = new Logger(EngineClient.name);
  private readonly url = process.env.ENGINE_URL ?? DEFAULT_URL;
  private readonly timeoutMs = Number(process.env.ENGINE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  constructor(private readonly schemas: SchemaRegistry) {}

  async decide(snapshot: SignalSnapshot, elementalLayer?: boolean): Promise<DecisionEnvelope> {
    const body = JSON.stringify({ snapshot, elemental_layer: elementalLayer ?? null });
    const started = Date.now();
    const response = await this.post("/decide", body);
    const envelope = (await response.json()) as DecisionEnvelope;

    // Runtime assertion, not just a test. Two validators of the same schema disagreeing is
    // contract drift, and it must be loud rather than laundered into a client-facing 400.
    const problem = this.schemas.firstProblem("decision-envelope", envelope);
    if (problem !== null) {
      this.log.error(`engine_contract_violation ${problem}`);
      throw new BadGatewayException({ error: "engine_contract_violation" });
    }

    this.log.log(
      `decide ok ${Date.now() - started}ms id=${envelope.decision_id} rulebook=v${envelope.engine.rulebook_version}`,
    );
    return envelope;
  }

  async health(): Promise<{ reachable: boolean; rulebookVersion?: number }> {
    try {
      const response = await this.fetchWithTimeout(`${this.url}/healthz`, { method: "GET" });
      if (!response.ok) return { reachable: false };
      const body = (await response.json()) as { rulebook_version?: number };
      // exactOptionalPropertyTypes is on: an absent key and an explicit `undefined` are
      // different things, so the property is only set when there is a value.
      return body.rulebook_version === undefined
        ? { reachable: true }
        : { reachable: true, rulebookVersion: body.rulebook_version };
    } catch {
      return { reachable: false };
    }
  }

  private async post(path: string, body: string): Promise<Response> {
    // `decide` is a pure function and therefore genuinely idempotent, so ONE retry on a
    // connect-level failure is safe. Zero retries once the sidecar has answered with a status:
    // a 4xx will not become a 2xx by asking again.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetchWithTimeout(`${this.url}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        return this.mapStatus(response);
      } catch (error) {
        if (error instanceof BadGatewayException || error instanceof Error === false) throw error;
        lastError = error;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 100));
      }
    }
    this.log.error(`engine_unavailable ${(lastError as Error)?.name ?? "unknown"}`);
    // No degradation to a fabricated or stale decision. There is no default advice, and
    // inventing one would be a compliance position, not a UX preference.
    throw new ServiceUnavailableException({ error: "engine_unavailable" });
  }

  private mapStatus(response: Response): Response {
    if (response.ok) return response;
    if (response.status === 422 || response.status === 400) {
      // The API already validated this payload against the same schema. If the sidecar
      // disagrees, the two validators have drifted — a 500, not a client 400.
      this.log.error(`engine rejected a snapshot the API accepted: ${response.status}`);
      throw new BadGatewayException({ error: "engine_contract_violation" });
    }
    this.log.error(`engine_error status=${response.status}`);
    throw new BadGatewayException({ error: "engine_error" });
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
  }
}
