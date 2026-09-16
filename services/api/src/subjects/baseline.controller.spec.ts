import { BadRequestException } from "@nestjs/common";

import { BaselineController } from "./baseline.controller";
import type { BaselineRepository, BaselineSubmission } from "./baseline.repository";

const SUBJECT = { authUserId: "0b6c1a8e-0000-4000-8000-000000000001", subjectRef: "sub_authed00001" };
const CHRIS = { J1: 1, J2a: 4, J2b: 2, J3: 2, J4a: 4, J4b: 4, J5: 4, J6: 4, J7: 3, J8a: 5, J8b: 4 };

function make(latest: BaselineSubmission | null = null) {
  const store: BaselineSubmission[] = latest === null ? [] : [latest];
  const repo = {
    latest: jest.fn(async () => store[store.length - 1] ?? null),
    submit: jest.fn(async (_ref: string, s: Omit<BaselineSubmission, "submitted_at">) => {
      store.push({ ...s, submitted_at: "2026-09-16T10:00:00Z" });
    }),
    identity: jest.fn(),
    updateIdentity: jest.fn().mockResolvedValue(undefined),
    waistHistory: jest.fn().mockResolvedValue([]),
  };
  return { controller: new BaselineController(repo as unknown as BaselineRepository), repo };
}

describe("BaselineController", () => {
  it("scores a submission and returns the description, never the scores (SCRUM-91)", async () => {
    const { controller, repo } = make();
    const view = await controller.submit(SUBJECT, { answers: CHRIS, energy_dip_at: "13:00" });
    expect(view.fragments.map((f) => f.text)).toEqual([
      "You're a slow starter who runs steady once you're going.",
      "Under pressure you get direct and push for a resolution.",
      "Your rhythm varies a lot day to day at the moment.",
      "You bounce back quickly from a hard day.",
    ]);
    expect(view.personalising).toBe(false);
    expect(view.energy_dip_at).toBe("13:00");
    const json = JSON.stringify(view);
    for (const banned of ["score", "confidence", "vata", "pitta", "kapha", "Morning activation", "25", "75", "52.5"]) {
      expect(json).not.toContain(banned);
    }
    expect(repo.submit).toHaveBeenCalledWith("sub_authed00001", expect.objectContaining({
      instrument: "module-j",
      instrument_version: "1.0",
      answers: CHRIS,
    }));
  });

  it("refuses incomplete or out-of-range answers before storing anything", async () => {
    const { controller, repo } = make();
    await expect(controller.submit(SUBJECT, { answers: { ...CHRIS, J7: 9 } })).rejects.toThrow(BadRequestException);
    await expect(controller.submit(SUBJECT, { answers: { J1: 1 } })).rejects.toThrow(BadRequestException);
    await expect(controller.submit(SUBJECT, { answers: CHRIS, energy_dip_at: "1pm" })).rejects.toThrow(BadRequestException);
    expect(repo.submit).not.toHaveBeenCalled();
  });

  it("drops answer keys that aren't instrument items", async () => {
    const { controller, repo } = make();
    await controller.submit(SUBJECT, { answers: { ...CHRIS, dosha: 3, T5: 99 } });
    const stored = repo.submit.mock.calls[0]![1] as { answers: Record<string, number> };
    expect(stored.answers).toEqual(CHRIS);
  });

  it("records which sentence a correction was against", async () => {
    const { controller, repo } = make();
    await controller.submit(SUBJECT, { answers: { ...CHRIS, J7: 4 }, corrected_fragment: "T5" });
    expect(repo.submit).toHaveBeenCalledWith("sub_authed00001", expect.objectContaining({ corrected_fragment: "T5" }));
  });

  it("returns null with no baseline yet", async () => {
    expect(await make().controller.current(SUBJECT)).toBeNull();
  });

  it("validates identity answers against their ranges", async () => {
    const { controller, repo } = make();
    repo.identity.mockResolvedValue({});
    await controller.updateIdentity(SUBJECT, { height_cm: 180.4, waist_cm: 92.25, usual_wake_time: "07:00", work_pattern: "shift" });
    expect(repo.updateIdentity).toHaveBeenCalledWith(
      "sub_authed00001",
      { height_cm: 180, waist_cm: 92.3, usual_wake_time: "07:00", work_pattern: "shift" },
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    await expect(controller.updateIdentity(SUBJECT, { waist_cm: 12 })).rejects.toThrow(BadRequestException);
    await expect(controller.updateIdentity(SUBJECT, { work_pattern: "gig" })).rejects.toThrow(BadRequestException);
    await expect(controller.updateIdentity(SUBJECT, { usual_sleep_time: "25:00" })).rejects.toThrow(BadRequestException);
  });

  it("serves the instrument without weights or fragments", () => {
    const body = make().controller.instrument();
    expect(body.items).toHaveLength(12);
    expect(JSON.stringify(body)).not.toMatch(/weight|fragments|Morning activation/);
  });
});
