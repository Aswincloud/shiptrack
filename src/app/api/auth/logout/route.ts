import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Form submissions (Content-Type: application/x-www-form-urlencoded) get a
  // redirect so the browser navigates. Fetch calls get a 204.
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const target = new URL("/", req.url);
    return NextResponse.redirect(target, { status: 303, headers: { "Set-Cookie": clearSessionCookie() } });
  }
  return new NextResponse(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie() } });
}
