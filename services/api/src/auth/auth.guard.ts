import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";

import { SubjectRepository } from "../subjects/subject.repository";
import { JwtVerifier } from "./jwt.verifier";

/** What an authenticated request carries. The subject_ref is the only key for health data. */
export interface AuthedSubject {
  authUserId: string;
  subjectRef: string;
}

interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  subject?: AuthedSubject;
}

/**
 * Every route that touches a subject's data sits behind this.
 *
 * Verifies the bearer token, then resolves the Supabase user to their pseudonymous subject_ref,
 * creating one on first sight. Controllers never see a user id or a client-supplied
 * subject_ref: they get the subject this token belongs to, and nothing else.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly log = new Logger(AuthGuard.name);

  constructor(
    private readonly verifier: JwtVerifier,
    private readonly subjects: SubjectRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.verifier.configured) {
      this.log.error("SUPABASE_URL is not set; refusing every authenticated request");
      throw new ServiceUnavailableException({ error: "auth_not_configured" });
    }
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    const match = /^Bearer\s+(\S+)$/i.exec(value ?? "");
    if (match?.[1] === undefined) throw new UnauthorizedException({ error: "unauthenticated" });

    const authUserId = await this.verifier.verify(match[1]);
    if (authUserId === null) throw new UnauthorizedException({ error: "unauthenticated" });

    const subjectRef = await this.subjects.resolveOrCreate(authUserId);
    request.subject = { authUserId, subjectRef };
    return true;
  }
}

/** The authenticated subject, as resolved by AuthGuard. Only valid on guarded routes. */
export const CurrentSubject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthedSubject => {
    const subject = context.switchToHttp().getRequest<AuthedRequest>().subject;
    if (subject === undefined) {
      // A route used @CurrentSubject without @UseGuards(AuthGuard). A programming error, so a
      // 500 rather than a 401, and loud.
      throw new Error("CurrentSubject used on a route without AuthGuard");
    }
    return subject;
  },
);
