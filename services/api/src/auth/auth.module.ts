import { Global, Module } from "@nestjs/common";

import { ConsentRepository } from "../subjects/consent.repository";
import { SubjectRepository } from "../subjects/subject.repository";
import { SupabaseAdminClient } from "../subjects/supabase-admin.client";
import { AuthGuard } from "./auth.guard";
import { JwtVerifier } from "./jwt.verifier";

const PROVIDERS = [JwtVerifier, AuthGuard, SubjectRepository, ConsentRepository, SupabaseAdminClient];

/** Global so any controller can use `@UseGuards(AuthGuard)` without re-importing. */
@Global()
@Module({ providers: PROVIDERS, exports: PROVIDERS })
export class AuthModule {}
