import { BadRequestException } from "@nestjs/common";

import { MeController } from "./me.controller";
import type { Profile, SubjectRepository } from "./subject.repository";
import type { SupabaseAdminClient } from "./supabase-admin.client";

const SUBJECT = { authUserId: "0b6c1a8e-0000-4000-8000-000000000001", subjectRef: "sub_authed00001" };

function make(profile: Profile = { region: null, constitution: null }, authDeleted = true) {
  const subjects = {
    profile: jest.fn().mockResolvedValue(profile),
    updateProfile: jest.fn().mockImplementation(async (_ref, patch) => ({
      region: patch.region ?? profile.region,
      constitution: patch.dosha ? { dosha: patch.dosha } : profile.constitution,
    })),
    eraseSubject: jest.fn().mockResolvedValue(undefined),
  };
  const admin = { deleteUser: jest.fn().mockResolvedValue(authDeleted) };
  const controller = new MeController(
    subjects as unknown as SubjectRepository,
    admin as unknown as SupabaseAdminClient,
  );
  return { controller, subjects, admin };
}

describe("MeController", () => {
  it("reports onboarded only once region and constitution are both set", async () => {
    expect((await make().controller.me(SUBJECT)).onboarded).toBe(false);
    const done = make({ region: "UK", constitution: { dosha: "pitta" } });
    expect((await done.controller.me(SUBJECT)).onboarded).toBe(true);
  });

  it("stores region and dosha from the onboarding answers", async () => {
    const { controller, subjects } = make();
    await controller.updateProfile(SUBJECT, { region: "US", constitution: { dosha: "kapha" } });
    expect(subjects.updateProfile).toHaveBeenCalledWith("sub_authed00001", {
      region: "US",
      dosha: "kapha",
    });
  });

  it.each([
    [{ region: "FR" }],
    [{ constitution: { dosha: "fire" } }],
  ])("rejects a value outside the allowed set: %j", async (body) => {
    await expect(make().controller.updateProfile(SUBJECT, body)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("erases health data before deleting the auth account", async () => {
    const { controller, subjects, admin } = make();
    const result = await controller.deleteAccount(SUBJECT);
    expect(result).toEqual({ data_erased: true, auth_account_deleted: true });
    const erased = subjects.eraseSubject.mock.invocationCallOrder[0]!;
    const deleted = admin.deleteUser.mock.invocationCallOrder[0]!;
    expect(erased).toBeLessThan(deleted);
    expect(admin.deleteUser).toHaveBeenCalledWith(SUBJECT.authUserId);
  });

  it("says so when the auth account could not be deleted, rather than claiming it was", async () => {
    const { controller } = make({ region: null, constitution: null }, false);
    expect(await controller.deleteAccount(SUBJECT)).toEqual({
      data_erased: true,
      auth_account_deleted: false,
    });
  });
});
