import { NextRequest, NextResponse } from "next/server";

// DTDC is a link-out, not a tracked carrier: its public tracking sits behind a
// captcha and its API needs credentials we don't have yet (requested from DTDC,
// Oct 2026). So /track/dtdc/<AWB> sends the visitor to DTDC's own page, which
// reads the AWB from ?awb= and looks it up there.
//
// This route exists because the invoicer's WhatsApp "shipped" template has a
// Track button whose URL prefix is fixed at https://shiptrack.aswincloud.com/track/
// — only the "<carrier>/<awb>" suffix varies per message — so a DTDC parcel's
// button has to land here and be forwarded.
//
// The destination host is fixed; only the AWB varies, and only after the same
// letters/digits/dash check the invoicer applies, so this can't be used as an
// open redirect.
const DTDC_TRACK = "https://www.dtdc.com/track-your-shipment/";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tracking: string }> }) {
  const { tracking } = await params;
  // Already decoded by Next.js; decoding again would throw on a literal "%".
  const awb = tracking.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(awb)) {
    return NextResponse.redirect(DTDC_TRACK, 302);
  }
  return NextResponse.redirect(`${DTDC_TRACK}?awb=${encodeURIComponent(awb)}`, 302);
}
