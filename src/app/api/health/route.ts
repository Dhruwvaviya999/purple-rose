import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";

/**
 * Liveness and dependency probe for deployments and uptime checks.
 *
 * Phase 1 reported only that the process was serving requests. It now also
 * reports whether the database is reachable, because an application that
 * cannot reach PostgreSQL is not actually healthy. The Phase 1 response keys
 * are unchanged; `database` is additive.
 *
 * Nothing here reveals the connection string, the SQL that was run, the
 * driver in use, or a stack trace. The real reason is written to the server
 * log, where operators can see it and users cannot.
 */

type DependencyStatus = "ok" | "unavailable";

/** Cheapest possible round trip that proves the connection actually works. */
async function checkDatabase(): Promise<DependencyStatus> {
  try {
    // Imported here, not at module scope, so a configuration problem such as
    // a missing DATABASE_URL is reported as an unhealthy dependency instead
    // of throwing while the route module loads.
    const { prisma } = await import("@/lib/db/client");
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch (error) {
    console.error(
      "Health check: database unreachable.",
      error instanceof Error ? error.message : error,
    );
    return "unavailable";
  }
}

export async function GET() {
  const database = await checkDatabase();
  const healthy = database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: siteConfig.name,
      timestamp: new Date().toISOString(),
      database,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
