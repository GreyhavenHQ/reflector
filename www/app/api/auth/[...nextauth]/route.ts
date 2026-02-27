import NextAuth from "next-auth";
import { authOptions } from "../../../lib/authBackend";

export const dynamic = "force-dynamic";

// authOptions() is deferred to request time to avoid calling getNextEnvVar
// during Turbopack's build-phase module evaluation (Next.js 16+)
export function GET(req: Request, ctx: any) {
  return NextAuth(authOptions())(req as any, ctx);
}

export function POST(req: Request, ctx: any) {
  return NextAuth(authOptions())(req as any, ctx);
}
