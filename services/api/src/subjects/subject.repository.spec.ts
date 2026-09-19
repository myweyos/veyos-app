import type { Sql } from "postgres";

import { SubjectRepository } from "./subject.repository";

const USER = "0b6c1a8e-0000-4000-8000-000000000001";

describe("SubjectRepository", () => {
  it("mints a schema-valid pseudonymous subject_ref and returns the stored one", async () => {
    const sql = jest.fn()
      .mockResolvedValueOnce([]) // INSERT ... ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([{ subject_ref: "sub_0123456789abcdef01234567" }]) as unknown as Sql;
    const ref = await new SubjectRepository(sql).resolveOrCreate(USER);
    expect(ref).toBe("sub_0123456789abcdef01234567");

    const insert = (sql as unknown as jest.Mock).mock.calls[0] as [string[], string, string];
    expect(insert[0].join("?")).toMatch(/ON CONFLICT \(auth_user_id\) DO NOTHING/);
    expect(insert[1]).toMatch(/^sub_[a-zA-Z0-9]{8,}$/); // signal-snapshot.schema.json pattern
    expect(insert[2]).toBe(USER);
  });

  it("maps the stored dosha to a constitution, and absent answers to null", async () => {
    const answered = jest.fn().mockResolvedValue([{ region: "UK", constitution_dosha: "vata" }]);
    expect(await new SubjectRepository(answered as unknown as Sql).profile("sub_x0000001")).toEqual({
      region: "UK",
      constitution: { dosha: "vata" },
    });
    const fresh = jest.fn().mockResolvedValue([{ region: null, constitution_dosha: null }]);
    expect(await new SubjectRepository(fresh as unknown as Sql).profile("sub_x0000001")).toEqual({
      region: null,
      constitution: null,
    });
  });

  it("erases snapshots and decisions before the subject row, in one transaction", async () => {
    const statements: string[] = [];
    const tx = jest.fn((parts: TemplateStringsArray) => {
      statements.push(parts.join("?"));
      return Promise.resolve([]);
    });
    const sql = { begin: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) };
    await new SubjectRepository(sql as unknown as Sql).eraseSubject("sub_x0000001");
    expect(sql.begin).toHaveBeenCalledTimes(1);
    expect(statements.map((s) => s.match(/DELETE FROM (\w+)/)?.[1])).toEqual([
      "signal_snapshots",
      "decisions",
      "subjects",
    ]);
  });
});
