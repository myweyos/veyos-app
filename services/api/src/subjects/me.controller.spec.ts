import { BadRequestException } from "@nestjs/common";

import type { ConsentRepository, ConsentState } from "./consent.repository";
import { MeController } from "./me.controller";
import type { Profile, SubjectRepository } from "./subject.repository";
import type { SupabaseAdminClient } from "./supabase-admin.client";

const SUBJECT = { authUserId: "0b6c1a8e-0000-4000-8000-000000000001", subjectRef: "sub_authed00001" };

const NONE: ConsentState = {
  health_data: false,
  cycle_data: false,
  lab_results: false,
  location_environment: false,
  notifications: false,
  product_analytics: false,
};

function make(
  profile: Profile = { region: null, constitution: null },
  authDeleted = true,
  consentState: ConsentState = NONE,
) {
  const subjects = {
    profile: jest.fn().mockResolvedValue(profile),
    updateProfile: jest.fn().mockImplementation(async (_ref, patch) => ({
      region: patch.region ?? profile.region,
      constitution: patch.dosha ? { dosha: patch.dosha } : profile.constitution,
    })),
    eraseSubject: jest.fn().mockResolvedValue(undefined),
  };
  const admin = { deleteUser: jest.fn().mockResolvedValue(authDeleted) };
  const consents = {
    current: jest.fn().mockResolvedValue(consentState),
    record: jest.fn().mockImplementation(async (_ref, d) => ({ ...consentState, ...d })),
  };
  const controller = new MeController(
    subjects as unknown as SubjectRepository,
    consents as unknown as ConsentRepository,
    admin as unknown as SupabaseAdminClient,
  );
  return { controller, subjects, admin, consents };
}

describe("MeController", () => {
  it("is onboarded only with a region, a constitution AND health-data consent", async () => {
    const answered: Profile = { region: "UK", constitution: { dosha: "pitta" } };
    expect((await make().controller.me(SUBJECT)).onboarded).toBe(false);
    expect((await make(answered).controller.me(SUBJECT)).onboarded).toBe(false);
    const consented = make(answered, true, { ...NONE, health_data: true });
    expect((await consented.controller.me(SUBJECT)).onboarded).toBe(true);
  });

  it("records consent decisions with the copy version the subject saw", async () => {
    const { controller, consents } = make();
    await controller.recordConsents(SUBJECT, {
      copy_version: "a4-2026-09-14",
      decisions: { health_data: true, product_analytics: false },
    });
    expect(consents.record).toHaveBeenCalledWith(
      "sub_authed00001",
      { health_data: true, product_analytics: false },
      "a4-2026-09-14",
    );
  });

  it.each([
    [{ decisions: { health_data: true } }],
    [{ copy_version: "v1", decisions: { voice: true } }],
    [{ copy_version: "v1", decisions: { health_data: "yes" } }],
  ])("rejects a malformed consent body: %j", async (body) => {
    await expect(make().controller.recordConsents(SUBJECT, body)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("maps the A7 answer position to the constitution server-side (SCRUM-91)", async () => {
    const { controller, subjects } = make();
    await controller.updateProfile(SUBJECT, { region: "US", constitution: { answer: 3 } });
    expect(subjects.updateProfile).toHaveBeenCalledWith("sub_authed00001", {
      region: "US",
      dosha: "kapha",
    });
  });

  it("never returns a type label to the client", async () => {
    const answered: Profile = { region: "UK", constitution: { dosha: "pitta" } };
    const view = await make(answered).controller.me(SUBJECT);
    expect(view).toEqual({ region: "UK", constitution_set: true, consents: NONE, onboarded: false });
    expect(JSON.stringify(view)).not.toMatch(/vata|pitta|kapha|dosha/);
  });

  it.each([
    [{ region: "FR" }],
    [{ constitution: { answer: 4 } }],
    [{ constitution: { answer: "kapha" } }],
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
