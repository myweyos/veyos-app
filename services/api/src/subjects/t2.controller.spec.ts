import { BadRequestException } from "@nestjs/common";

import { T2Controller, t2Status } from "./t2.controller";
import type { T2Repository } from "./t2.repository";

const SUBJECT = { authUserId: "0b6c1a8e-0000-4000-8000-000000000001", subjectRef: "sub_authed00001" };

function make(createdAt: string | null = "2026-09-01T10:00:00Z") {
  const store: Record<string, unknown> = {};
  const repo = {
    current: jest.fn(async () => ({ ...store })),
    record: jest.fn(async (_ref: string, _i: string, _v: string, answers: Record<string, unknown>) => {
      Object.assign(store, answers);
    }),
    subjectCreatedAt: jest.fn().mockResolvedValue(createdAt),
  };
  return { controller: new T2Controller(repo as unknown as T2Repository), repo, store };
}

describe("T2 (week-one re-entry)", () => {
  it("unlocks seven days after the account was created, and not before", () => {
    const created = "2026-09-01T10:00:00Z";
    expect(t2Status(created, new Date("2026-09-07T09:00:00Z"))).toEqual({ unlocked: false, unlocks_on: "2026-09-08" });
    expect(t2Status(created, new Date("2026-09-08T10:00:00Z"))).toEqual({ unlocked: true, unlocks_on: "2026-09-08" });
    expect(t2Status(null, new Date())).toEqual({ unlocked: false, unlocks_on: null });
  });

  it("accepts a partial set of answers and reports progress", async () => {
    const { controller } = make();
    const view = await controller.save(SUBJECT, { answers: { D1: 3, D4: [2, 3] } });
    expect(view.answered).toBe(2);
    expect(view.total).toBe(8);
    expect(view.answers).toEqual({ D1: 3, D4: [2, 3] });
  });

  it("is resumable: a later save adds to, and can change, earlier answers", async () => {
    const { controller } = make();
    await controller.save(SUBJECT, { answers: { D1: 3 } });
    const view = await controller.save(SUBJECT, { answers: { D1: 4, E1: 2 } });
    expect(view.answers).toEqual({ D1: 4, E1: 2 });
  });

  it("refuses unknown items and malformed answers, storing nothing", async () => {
    const { controller, repo } = make();
    await expect(controller.save(SUBJECT, { answers: { D1: 3, steps: 9000 } })).rejects.toThrow(BadRequestException);
    await expect(controller.save(SUBJECT, { answers: { D4: [7, 1] } })).rejects.toThrow(BadRequestException);
    await expect(controller.save(SUBJECT, { answers: { D2: "eight" } })).rejects.toThrow(BadRequestException);
    expect(repo.record).not.toHaveBeenCalled();
  });

  it("serves the instrument without the downstream-use notes", () => {
    const body = make().controller.instrument();
    expect(body.items).toHaveLength(8);
    expect(JSON.stringify(body)).not.toMatch(/"use"|SAFETY SIGNAL|\$comment/);
  });
});
