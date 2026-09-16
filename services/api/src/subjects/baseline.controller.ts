import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  MODULE_J,
  describe,
  personalises,
  score,
  validateAnswers,
  type Answers,
  type Fragment,
} from "@weyos/phenotype";

import { AuthGuard, CurrentSubject, type AuthedSubject } from "../auth/auth.guard";
import { BaselineRepository, type IdentityAnswers } from "./baseline.repository";

/**
 * What a client gets back. The description and nothing that could reconstruct a score.
 *
 * SCRUM-91: no API surface returns a type label, a score, a percentage or an axis name to the
 * client. `fragments[].key` is an axis id ("T5") or a pair id ("T1+T2"). It exists so the
 * app can send a correction against the right sentence, and it goes nowhere near a screen.
 * `personalising` says whether ANY trait clears the confidence gate, so the app never implies
 * tailoring that isn't happening.
 */
export interface BaselineView {
  instrument_version: string;
  submitted_at: string;
  fragments: Fragment[];
  personalising: boolean;
  energy_dip_at: string | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIXED_START = ["no", "some", "yes"] as const;
const WORK_PATTERN = ["fixed", "flexible", "shift", "self-directed"] as const;

@Controller("v1/me/baseline")
@UseGuards(AuthGuard)
export class BaselineController {
  constructor(private readonly baselines: BaselineRepository) {}

  /** The instrument, so the app renders the questions the server will score. */
  @Get("instrument")
  @Header("cache-control", "public, max-age=300")
  instrument() {
    const { instrument, instrument_version, items } = MODULE_J;
    // Authoring notes ($comment) stay in the repo; they are not for the client.
    const clean = items.map((item) => Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith("$"))));
    return { instrument, instrument_version, items: clean };
  }

  @Get()
  @Header("cache-control", "no-store")
  async current(@CurrentSubject() subject: AuthedSubject): Promise<BaselineView | null> {
    const latest = await this.baselines.latest(subject.subjectRef);
    if (latest === null) return null;
    const traits = score(latest.answers, "self_report_onboarding");
    return {
      instrument_version: latest.instrument_version,
      submitted_at: latest.submitted_at,
      fragments: describe(traits),
      personalising: Object.values(traits).some((t) => personalises(t)),
      energy_dip_at: latest.energy_dip_at,
    };
  }

  /**
   * Submit or correct the baseline. Body:
   *   { answers: { J1: 1..5, ... }, energy_dip_at: "HH:MM" | null, corrected_fragment?: "T5" }
   *
   * A correction is a full re-submission with the re-asked item changed; `corrected_fragment`
   * records which sentence the person said didn't sound like them.
   */
  @Put()
  async submit(
    @CurrentSubject() subject: AuthedSubject,
    @Body() body: { answers?: unknown; energy_dip_at?: unknown; corrected_fragment?: unknown },
  ): Promise<BaselineView> {
    const answers = body.answers;
    if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
      throw new BadRequestException({ error: "answers_required" });
    }
    const problems = validateAnswers(answers as Answers);
    if (problems.length > 0) throw new BadRequestException({ error: "invalid_answers", problems });

    const dip = body.energy_dip_at;
    if (dip !== undefined && dip !== null && (typeof dip !== "string" || !TIME.test(dip))) {
      throw new BadRequestException({ error: "invalid_energy_dip" });
    }
    const corrected = body.corrected_fragment;
    if (corrected !== undefined && corrected !== null && typeof corrected !== "string") {
      throw new BadRequestException({ error: "invalid_corrected_fragment" });
    }

    // Only scored and required items are kept: nothing a client adds rides along.
    const kept: Answers = {};
    for (const item of MODULE_J.items) {
      const v = (answers as Answers)[item.id];
      if (v !== undefined) kept[item.id] = v;
    }
    await this.baselines.submit(subject.subjectRef, {
      instrument: MODULE_J.instrument,
      instrument_version: MODULE_J.instrument_version,
      answers: kept,
      energy_dip_at: (dip as string | null | undefined) ?? null,
      corrected_fragment: (corrected as string | null | undefined) ?? null,
    });
    return (await this.current(subject)) as BaselineView;
  }

  @Get("identity")
  @Header("cache-control", "no-store")
  identity(@CurrentSubject() subject: AuthedSubject): Promise<IdentityAnswers> {
    return this.baselines.identity(subject.subjectRef);
  }

  /** Module A answers (SCRUM-95). Any subset; each value is checked against its column's range. */
  @Put("identity")
  async updateIdentity(
    @CurrentSubject() subject: AuthedSubject,
    @Body() body: Record<string, unknown>,
  ): Promise<IdentityAnswers> {
    const patch: Partial<IdentityAnswers> = {};
    const num = (key: "height_cm" | "weight_kg" | "waist_cm", min: number, max: number) => {
      const v = body[key];
      if (v === undefined) return;
      if (v === null) { patch[key] = null; return; }
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
        throw new BadRequestException({ error: `invalid_${key}`, range: [min, max] });
      }
      patch[key] = key === "height_cm" ? Math.round(v) : Math.round(v * 10) / 10;
    };
    num("height_cm", 100, 250);
    num("weight_kg", 30, 300);
    num("waist_cm", 40, 200);

    const str = <K extends "date_of_birth" | "usual_wake_time" | "usual_sleep_time">(key: K, re: RegExp) => {
      const v = body[key];
      if (v === undefined) return;
      if (v === null) { patch[key] = null; return; }
      if (typeof v !== "string" || !re.test(v)) throw new BadRequestException({ error: `invalid_${key}` });
      patch[key] = v as IdentityAnswers[K];
    };
    str("date_of_birth", DATE);
    str("usual_wake_time", TIME);
    str("usual_sleep_time", TIME);

    const oneOf = <K extends "fixed_start" | "work_pattern">(key: K, allowed: readonly string[]) => {
      const v = body[key];
      if (v === undefined) return;
      if (v === null) { patch[key] = null; return; }
      if (typeof v !== "string" || !allowed.includes(v)) {
        throw new BadRequestException({ error: `invalid_${key}`, allowed });
      }
      patch[key] = v as IdentityAnswers[K];
    };
    oneOf("fixed_start", FIXED_START);
    oneOf("work_pattern", WORK_PATTERN);

    await this.baselines.updateIdentity(subject.subjectRef, patch, new Date().toISOString().slice(0, 10));
    return this.baselines.identity(subject.subjectRef);
  }

  /** Waist history for H1: values and dates, no verdict, no threshold (SCRUM-99). */
  @Get("waist")
  @Header("cache-control", "no-store")
  waist(@CurrentSubject() subject: AuthedSubject) {
    return this.baselines.waistHistory(subject.subjectRef);
  }
}
