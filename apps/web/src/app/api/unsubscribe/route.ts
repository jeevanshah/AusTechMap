import { NextResponse } from "next/server";

import { getPool } from "../../../lib/db";
import { suppressEmail } from "../../../lib/queries/emailSuppressions";
import {
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "../../../lib/retention/unsubscribeToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe (RFC 8058). Mail clients POST here with
 * `List-Unsubscribe=One-Click`; the /unsubscribe page posts here from a form.
 * Authority is the signed token in the query string — no session needed, so a
 * months-old email still works. GET is intentionally absent: link prefetchers
 * and scanners must never unsubscribe anyone.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = unsubscribeSecret();
  const token = new URL(request.url).searchParams.get("t");
  const userId = secret ? verifyUnsubscribeToken(token, secret) : null;
  if (userId === null) {
    return new NextResponse("Invalid or expired unsubscribe link.", {
      status: 400,
    });
  }

  try {
    await suppressEmail(getPool(), userId, "unsubscribed");
  } catch (error) {
    console.error(
      "unsubscribe failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return new NextResponse("Could not unsubscribe right now. Try again.", {
      status: 500,
    });
  }

  const body = await request.text().catch(() => "");
  if (body.includes("List-Unsubscribe=One-Click")) {
    return new NextResponse("Unsubscribed.", { status: 200 });
  }
  // Form submit from the confirmation page.
  return NextResponse.redirect(new URL("/unsubscribe?done=1", request.url), {
    status: 303,
  });
}
