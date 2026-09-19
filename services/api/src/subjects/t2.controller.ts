import { BadRequestException, Body, Controller, Get, Header, Put, UseGuards } from "@nestjs/common";
import { MODULE_DE, validateT2Answer, type T2Answer } from "@weyos/phenotype";

import { AuthGuard, CurrentSubject, type AuthedSubject } from "../auth/auth.guard";
import { T2Repository } from "./t2.repository";

/** The T2 surface unlocks this many days after the account is created (SCRUM-98). */
export const T2_UNLOCK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface T2View {
  unlocked: boolean;
  unlocks_on: string | null; // YYYY-MM-DD
  answered: number;
  total: number;
  answers: Record<string, T2Answer>;
}

export function t2Status(createdAt: string | null, now: Date): { unlocked: boolean; unlocks_on: string | null } {
  if (createdAt === null) return { unlocked: false, unlocks_on: null };
  const unlockAt = new Date(Date.parse(createdAt) + T2_UNLOCK_DAYS * DAY_MS);
  return { unlocked: now >= unlockAt, unlocks_on: unlockAt.toISOString().slice(0, 10) };
}

/**
 * T2, the week-one re-entry surface (SCRUM-97, SCRUM-98).
 *
 * Unlocks after week one and asks for nothing: no notification, no takeover. Any subset of
 * items may be saved, so the surface is resumable and partial completion is a valid state.
 */
@Controller("v1/me/t2")
@UseGuards(AuthGuard)
export class T2Controller {
  constructor(private readonly t2: T2Repository) {}

  @Get("instrument")
  @Header("cache-control", "public, max-age=300")
  instrument() {
    const { instrument, instrument_version, items } = MODULE_DE;
    // `use` is the developer-facing downstream use, not copy: it stays out of the payload.
    const clean = items.map(({ use: _use, ...item }) =>
      Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith("$"))),
    );
    return { instrument, instrument_version, items: clean };
  }

  @Get()
  @Header("cache-control", "no-store")
  async current(@CurrentSubject() subject: AuthedSubject): Promise<T2View> {
    const [createdAt, answers] = await Promise.all([
      this.t2.subjectCreatedAt(subject.subjectRef),
      this.t2.current(subject.subjectRef),
    ]);
    return {
      ...t2Status(createdAt, new Date()),
      answered: Object.keys(answers).length,
      total: MODULE_DE.items.length,
      answers,
    };
  }

  /** Save any subset of answers. Unknown items and malformed answers are refused. */
  @Put()
  async save(
    @CurrentSubject() subject: AuthedSubject,
    @Body() body: { answers?: Record<string, unknown> },
  ): Promise<T2View> {
    const incoming = body.answers;
    if (incoming === null || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new BadRequestException({ error: "answers_required" });
    }
    const byId = new Map(MODULE_DE.items.map((i) => [i.id, i]));
    const valid: Record<string, T2Answer> = {};
    const problems: string[] = [];
    for (const [id, value] of Object.entries(incoming)) {
      const item = byId.get(id);
      if (item === undefined) {
        problems.push(`${id}: not an item`);
        continue;
      }
      const problem = validateT2Answer(item, value);
      if (problem !== null) problems.push(problem);
      else valid[id] = value as T2Answer;
    }
    if (problems.length > 0) throw new BadRequestException({ error: "invalid_answers", problems });
    if (Object.keys(valid).length > 0) {
      await this.t2.record(subject.subjectRef, MODULE_DE.instrument, MODULE_DE.instrument_version, valid);
    }
    return this.current(subject);
  }
}
