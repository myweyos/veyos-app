import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Put,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, CurrentSubject, type AuthedSubject } from "../auth/auth.guard";
import { BaselineRepository } from "./baseline.repository";
import { ConsentRepository, PURPOSES, type ConsentState, type Purpose } from "./consent.repository";
import { SubjectRepository, type Dosha, type Profile, type Region } from "./subject.repository";
import { SupabaseAdminClient } from "./supabase-admin.client";

/** In the order the A7 answers are listed: cold/dry/unsettled, overheated, heavy/sluggish. */
const DOSHAS: readonly Dosha[] = ["vata", "pitta", "kapha"];
const REGIONS: readonly Region[] = ["UK", "US"];

/** What the client sees of the account. No constitution value, by design. */
export interface MeView {
  region: Region | null;
  constitution_set: boolean;
  consents: ConsentState;
  onboarded: boolean;
  /** Monthly waist re-ask (SCRUM-99): due when the last measurement is older than 30 days. */
  waist: { due: boolean; last_measured_on: string | null };
}

const WAIST_REASK_DAYS = 30;

export function waistDue(lastMeasuredOn: string | null, today: string): boolean {
  if (lastMeasuredOn === null) return true;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastMeasuredOn}T00:00:00Z`)) / 86_400_000;
  return age >= WAIST_REASK_DAYS;
}

/**
 * The signed-in account: profile (onboarding answers) and deletion.
 *
 * The profile holds what the engine needs every day and the wearable can't supply: the
 * constitution from A7, and the region from A3. Ingestion reads it server-side, so the app
 * never has to resend it with every snapshot.
 */
@Controller("v1/me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly consents: ConsentRepository,
    private readonly baselines: BaselineRepository,
    private readonly admin: SupabaseAdminClient,
  ) {}

  /**
   * Onboarded means the three things ingestion needs: a region, a constitution, and explicit
   * consent to process health data.
   */
  @Get()
  @Header("cache-control", "no-store")
  async me(
    @CurrentSubject() subject: AuthedSubject,
  ): Promise<MeView> {
    const [profile, consents, waist] = await Promise.all([
      this.subjects.profile(subject.subjectRef),
      this.consents.current(subject.subjectRef),
      this.baselines.waistHistory(subject.subjectRef),
    ]);
    const last = waist[waist.length - 1]?.measured_on ?? null;
    return this.view(profile, consents, last);
  }

  /**
   * SCRUM-91: no API surface returns a type label. The constitution is internal to the engine;
   * the client only learns whether it has been set.
   */
  private view(profile: Profile, consents: ConsentState, lastWaistOn: string | null): MeView {
    const constitution_set = profile.constitution !== null;
    return {
      region: profile.region,
      constitution_set,
      consents,
      onboarded: profile.region !== null && constitution_set && consents.health_data,
      waist: {
        due: waistDue(lastWaistOn, new Date().toISOString().slice(0, 10)),
        last_measured_on: lastWaistOn,
      },
    };
  }

  /**
   * Record consent decisions (A4). Body: `{ copy_version, decisions: { purpose: boolean } }`.
   * `copy_version` names the wording the subject saw, and is stored with every change.
   */
  @Put("consents")
  async recordConsents(
    @CurrentSubject() subject: AuthedSubject,
    @Body() body: { copy_version?: unknown; decisions?: Record<string, unknown> },
  ): Promise<ConsentState> {
    if (typeof body.copy_version !== "string" || body.copy_version === "") {
      throw new BadRequestException({ error: "copy_version_required" });
    }
    const decisions: Partial<ConsentState> = {};
    for (const [purpose, granted] of Object.entries(body.decisions ?? {})) {
      if (!PURPOSES.includes(purpose as Purpose) || typeof granted !== "boolean") {
        throw new BadRequestException({ error: "invalid_consent", allowed: PURPOSES });
      }
      decisions[purpose as Purpose] = granted;
    }
    return this.consents.record(subject.subjectRef, decisions, body.copy_version);
  }

  /**
   * Body: `{ region?, constitution?: { answer: 1 | 2 | 3 } }`.
   *
   * The food-profile question (design pack A7) has three answers, in the order the pack lists
   * them. The client sends the answer's position; the mapping to the engine's constitution
   * happens here, so no type label exists on the device (SCRUM-91). This step is replaced by
   * axis thresholds in SCRUM-92.
   */
  @Put("profile")
  async updateProfile(
    @CurrentSubject() subject: AuthedSubject,
    @Body() body: { region?: unknown; constitution?: { answer?: unknown } },
  ): Promise<MeView> {
    const patch: { region?: Region; dosha?: Dosha } = {};
    if (body.region !== undefined) {
      if (!REGIONS.includes(body.region as Region)) {
        throw new BadRequestException({ error: "invalid_region", allowed: REGIONS });
      }
      patch.region = body.region as Region;
    }
    const answer = body.constitution?.answer;
    if (answer !== undefined) {
      const dosha = typeof answer === "number" ? DOSHAS[answer - 1] : undefined;
      if (dosha === undefined) {
        throw new BadRequestException({ error: "invalid_constitution_answer", allowed: [1, 2, 3] });
      }
      patch.dosha = dosha;
    }
    const [profile, consents, waist] = await Promise.all([
      this.subjects.updateProfile(subject.subjectRef, patch),
      this.consents.current(subject.subjectRef),
      this.baselines.waistHistory(subject.subjectRef),
    ]);
    return this.view(profile, consents, waist[waist.length - 1]?.measured_on ?? null);
  }

  /**
   * Delete the account and everything held for it (SCRUM-76 AC).
   *
   * Health data is erased first, in one transaction. Then the auth account is deleted at
   * Supabase. If that second step can't run, the response says so rather than claiming a
   * complete deletion.
   */
  @Delete()
  @HttpCode(200)
  async deleteAccount(
    @CurrentSubject() subject: AuthedSubject,
  ): Promise<{ data_erased: true; auth_account_deleted: boolean }> {
    await this.subjects.eraseSubject(subject.subjectRef);
    const authDeleted = await this.admin.deleteUser(subject.authUserId);
    return { data_erased: true, auth_account_deleted: authDeleted };
  }
}
