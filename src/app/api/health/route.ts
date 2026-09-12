import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";

/**
 * Liveness probe for deployments and uptime checks.
 *
 * Deliberately reports only that the application process is serving requests.
 * Dependency checks (database, cache, providers) are added alongside those
 * dependencies, so this never claims health it cannot verify.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: siteConfig.name,
      timestamp: new Date().toISOString(),
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
