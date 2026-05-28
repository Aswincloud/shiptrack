import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout, h2Style, pStyle } from "../components/PolicyLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — ShipTrack",
};

export default function PrivacyPage() {
  return (
    <PolicyLayout title="Privacy Policy" subtitle="Last updated: 28 May 2026">
      <p style={pStyle}>
        ShipTrack is a free, open-source shipment tracking tool. This policy
        explains what we collect and why. Source code:{" "}
        <a href="https://github.com/Aswincloud/shiptrack">github.com/Aswincloud/shiptrack</a>.
      </p>

      <h2 style={h2Style}>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address, a salted PBKDF2 hash of your password, and the timestamp when you signed up.</li>
        <li><strong>Watches:</strong> the tracking numbers you register, an optional label, the carrier, the email address you want notified, and the polling interval you chose.</li>
        <li><strong>Event history:</strong> a record of carrier scan events for each watch so we can detect changes.</li>
        <li><strong>OTP codes:</strong> a hash of the one-time signup code is held until you verify (max 10 minutes), then deleted.</li>
      </ul>

      <h2 style={h2Style}>What we don&apos;t store</h2>
      <ul>
        <li>No payment information — the service is free.</li>
        <li>No third-party analytics, tracking pixels, or advertising cookies.</li>
        <li>No IP-address logging beyond Cloudflare&apos;s standard request logs (which we don&apos;t aggregate or analyse).</li>
        <li>We never see or store your raw password — only the PBKDF2 hash.</li>
      </ul>

      <h2 style={h2Style}>Where it lives</h2>
      <p style={pStyle}>
        Data is stored in Cloudflare D1 (managed SQLite) in the Asia-Pacific
        region. Emails are sent through Resend. Tracking lookups are made
        directly to Blue Dart&apos;s public tracking page.
      </p>

      <h2 style={h2Style}>Who can see it</h2>
      <p style={pStyle}>
        Only you can see your own watches in the dashboard. The site operator
        (admin) can see the list of registered users, their email, and watch
        counts — used to support users and prevent abuse. Admins do not see
        your password.
      </p>

      <h2 style={h2Style}>Deletion</h2>
      <p style={pStyle}>
        Cancel any watch from the dashboard or via the unsubscribe link in
        any alert email. To delete your account entirely, email{" "}
        <a href="mailto:aswin@aswincloud.com">aswin@aswincloud.com</a>. All
        your watches and event history are removed when the account is deleted.
      </p>

      <h2 style={h2Style}>Contact</h2>
      <p style={pStyle}>
        Questions? <a href="mailto:aswin@aswincloud.com">aswin@aswincloud.com</a>.
      </p>

      <p style={{ ...pStyle, marginTop: 32, color: "var(--muted)", fontSize: 13 }}>
        <Link href="/">← Back to ShipTrack</Link>
      </p>
    </PolicyLayout>
  );
}
