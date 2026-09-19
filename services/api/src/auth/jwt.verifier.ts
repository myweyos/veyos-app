import { Injectable, Logger } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Verifies Supabase Auth access tokens (SCRUM-76).
 *
 * Supabase signs access tokens either with the project's JWT secret (HS256, legacy) or with
 * asymmetric signing keys published at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. Both are
 * supported. Set SUPABASE_JWT_SECRET to use the first; leave it unset to use the JWKS.
 *
 * Checked on every token: signature, expiry, issuer (`<SUPABASE_URL>/auth/v1`) and audience
 * (`authenticated`). Anything else is a 401. The only claim used is `sub`, the Supabase user
 * id. It is mapped to a pseudonymous subject_ref by SubjectRepository and never stored against
 * biometric data (compliance.md: subject_ref is the only key biometric data is stored against).
 *
 * With SUPABASE_URL unset there is no way to authenticate anyone, and every authed route fails
 * closed. There is no bypass and no dev user: a code path that lets an unauthenticated request
 * read a subject's data is exactly what CLAUDE.md non-negotiable 9 rules out.
 */
@Injectable()
export class JwtVerifier {
  private readonly log = new Logger(JwtVerifier.name);
  private readonly url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  private readonly secret = process.env.SUPABASE_JWT_SECRET;
  private jwks: JWTVerifyGetKey | undefined;

  get configured(): boolean {
    return this.url !== undefined && this.url !== "";
  }

  /** Returns the Supabase user id, or null if the token is not acceptable for any reason. */
  async verify(token: string): Promise<string | null> {
    if (!this.configured) return null;
    const options = { issuer: `${this.url}/auth/v1`, audience: "authenticated" };
    try {
      const { payload } =
        this.secret !== undefined && this.secret !== ""
          ? await jwtVerify(token, new TextEncoder().encode(this.secret), {
              ...options,
              algorithms: ["HS256"],
            })
          : await jwtVerify(token, this.keySet(), options);
      return typeof payload.sub === "string" && payload.sub !== "" ? payload.sub : null;
    } catch (error) {
      // The reason class only (expired, bad signature, wrong audience). Never the token.
      this.log.debug(`token rejected: ${(error as { code?: string }).code ?? "unknown"}`);
      return null;
    }
  }

  private keySet(): JWTVerifyGetKey {
    this.jwks ??= createRemoteJWKSet(new URL(`${this.url}/auth/v1/.well-known/jwks.json`));
    return this.jwks;
  }
}
