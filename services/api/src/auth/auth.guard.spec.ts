import { ServiceUnavailableException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { SignJWT } from "jose";

import type { SubjectRepository } from "../subjects/subject.repository";
import { AuthGuard } from "./auth.guard";
import { JwtVerifier } from "./jwt.verifier";

const URL = "https://project.supabase.co";
const SECRET = "test-secret-at-least-32-characters-long!!";
const USER = "0b6c1a8e-0000-4000-8000-000000000001";

async function token(
  claims: { sub?: string; aud?: string; iss?: string; exp?: number } = {},
  secret = SECRET,
): Promise<string> {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(claims.iss ?? `${URL}/auth/v1`)
    .setAudience(claims.aud ?? "authenticated")
    .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 600);
  if (claims.sub !== "") jwt.setSubject(claims.sub ?? USER);
  return jwt.sign(new TextEncoder().encode(secret));
}

function context(authorization?: string): { ctx: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function guard(env: Record<string, string | undefined>) {
  const saved = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_JWT_SECRET };
  process.env.SUPABASE_URL = env.url;
  process.env.SUPABASE_JWT_SECRET = env.secret;
  if (env.url === undefined) delete process.env.SUPABASE_URL;
  if (env.secret === undefined) delete process.env.SUPABASE_JWT_SECRET;
  const verifier = new JwtVerifier();
  process.env.SUPABASE_URL = saved.url;
  process.env.SUPABASE_JWT_SECRET = saved.secret;
  const subjects = { resolveOrCreate: jest.fn().mockResolvedValue("sub_authed00001") };
  return { guard: new AuthGuard(verifier, subjects as unknown as SubjectRepository), subjects };
}

describe("AuthGuard (Supabase JWT, HS256)", () => {
  const configured = () => guard({ url: URL, secret: SECRET });

  it("accepts a valid token and attaches the subject", async () => {
    const { guard: g, subjects } = configured();
    const { ctx, request } = context(`Bearer ${await token()}`);
    await expect(g.canActivate(ctx)).resolves.toBe(true);
    expect(subjects.resolveOrCreate).toHaveBeenCalledWith(USER);
    expect(request["subject"]).toEqual({ authUserId: USER, subjectRef: "sub_authed00001" });
  });

  it.each([
    ["no header", undefined],
    ["not a bearer", "Basic abc"],
    ["garbage", "Bearer not.a.jwt"],
  ])("rejects %s with 401", async (_label, header) => {
    const { guard: g } = configured();
    await expect(g.canActivate(context(header).ctx)).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["wrong audience", { aud: "anon" }],
    ["wrong issuer", { iss: "https://other.supabase.co/auth/v1" }],
    ["no subject", { sub: "" }],
  ])("rejects a token that is %s", async (_label, claims) => {
    const { guard: g, subjects } = configured();
    const { ctx } = context(`Bearer ${await token(claims)}`);
    await expect(g.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(subjects.resolveOrCreate).not.toHaveBeenCalled();
  });

  it("rejects a token signed with another key", async () => {
    const { guard: g } = configured();
    const forged = await token({}, "some-other-secret-at-least-32-characters");
    await expect(g.canActivate(context(`Bearer ${forged}`).ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("fails closed with 503 when Supabase isn't configured: no bypass, no dev user", async () => {
    const { guard: g } = guard({ url: undefined, secret: undefined });
    await expect(g.canActivate(context(`Bearer ${await token()}`).ctx)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
