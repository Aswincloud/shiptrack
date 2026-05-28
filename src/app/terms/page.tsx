import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout, h2Style, pStyle } from "../components/PolicyLayout";

export const metadata: Metadata = {
  title: "Terms of Use — ShipTrack",
};

export default function TermsPage() {
  return (
    <PolicyLayout title="Terms of Use" subtitle="Last updated: 28 May 2026">
      <p style={pStyle}>
        By using ShipTrack you agree to the following. The terms are short on
        purpose — this is a free hobby project, not a commercial service.
      </p>

      <h2 style={h2Style}>The service is free, &ldquo;as is&rdquo;</h2>
      <p style={pStyle}>
        ShipTrack is provided without warranty of any kind. Tracking data comes
        from public carrier websites and may be delayed, inaccurate, or
        unavailable. Don&apos;t rely on alert emails for time-critical decisions.
        Always confirm important deliveries with the carrier directly.
      </p>

      <h2 style={h2Style}>Acceptable use</h2>
      <ul>
        <li>Track shipments that belong to you or that you have permission to track.</li>
        <li>Don&apos;t register a large number of watches to scrape carrier data — the polling cap is intentional.</li>
        <li>Don&apos;t use the service to harass, spam, or harm anyone.</li>
        <li>Don&apos;t attempt to break into the system or interfere with other users.</li>
      </ul>

      <h2 style={h2Style}>Account suspension</h2>
      <p style={pStyle}>
        Accounts that abuse the service may be deleted without notice. We&apos;ll
        try to email you first if it&apos;s a borderline case.
      </p>

      <h2 style={h2Style}>Carrier data</h2>
      <p style={pStyle}>
        Blue Dart and other carrier names are trademarks of their owners.
        ShipTrack is not affiliated with or endorsed by any carrier. We fetch
        publicly available tracking data on your behalf.
      </p>

      <h2 style={h2Style}>Open source</h2>
      <p style={pStyle}>
        The code is MIT-licensed and available at{" "}
        <a href="https://github.com/Aswincloud/shiptrack">github.com/Aswincloud/shiptrack</a>.
        You can self-host your own copy at any time.
      </p>

      <h2 style={h2Style}>Changes</h2>
      <p style={pStyle}>
        These terms may change as the project evolves. Material changes will
        be announced via the dashboard or email.
      </p>

      <h2 style={h2Style}>Contact</h2>
      <p style={pStyle}>
        <a href="mailto:aswin@aswincloud.com">aswin@aswincloud.com</a>.
      </p>

      <p style={{ ...pStyle, marginTop: 32, color: "var(--muted)", fontSize: 13 }}>
        <Link href="/">← Back to ShipTrack</Link>
      </p>
    </PolicyLayout>
  );
}
