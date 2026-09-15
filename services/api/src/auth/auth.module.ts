import { Global, Module } from "@nestjs/common";

import { SubjectRepository } from "../subjects/subject.repository";
import { SupabaseAdminClient } from "../subjects/supabase-admin.client";
import { AuthGuard } from "./auth.guard";
import { JwtVerifier } from "./jwt.verifier";

/** Global so any controller can use `@UseGuards(AuthGuard)` without re-importing. */
@Global()
@Module({
  providers: [JwtVerifier, AuthGuard, SubjectRepository, SupabaseAdminClient],
  exports: [JwtVerifier, AuthGuard, SubjectRepository, SupabaseAdminClient],
})
export class AuthModule {}
