import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout, pStyle } from "../components/PolicyLayout";

export const metadata: Metadata = {
  title: "Blue Dart tracking FAQ",
  description:
    "How does ShipTrack work? Is it free? How often does it check? Common questions about tracking Blue Dart shipments and getting email alerts.",
  alternates: { canonical: "/faq" },
};

const QA: { q: string; a: React.ReactNode; aText: string }[] = [
  {
    q: "What is ShipTrack?",
    a: (
      <>
        A free, open-source courier tracker. Today it supports Blue Dart and
        Shiprocket (which resolves most Indian couriers — Delhivery, Ekart,
        XpressBees, DTDC and more), plus Delhivery&apos;s own API for the
        operator&apos;s shipments. More carriers will follow.
      </>
    ),
    aText:
      "A free, open-source courier tracker. Today it supports Blue Dart and Shiprocket (which resolves most Indian couriers — Delhivery, Ekart, XpressBees, DTDC and more), plus Delhivery's own API for the operator's shipments. More carriers will follow.",
  },
  {
    q: "How much does it cost?",
    a: <>Nothing. There are no plans, ads, or tracking pixels.</>,
    aText: "Nothing. There are no plans, ads, or tracking pixels.",
  },
  {
    q: "How often is my shipment checked?",
    a: (
      <>
        You pick. The default is every 15 minutes, but each watch can be set
        anywhere from 15 minutes to 12 hours. Slower intervals are kinder to
        the carrier&apos;s site and just as accurate for non-urgent packages.
      </>
    ),
    aText:
      "You pick. The default is every 15 minutes, but each watch can be set anywhere from 15 minutes to 12 hours. Slower intervals are kinder to the carrier's site and just as accurate for non-urgent packages.",
  },
  {
    q: "Can I get notifications without creating an account?",
    a: (
      <>
        You can <em>view</em> a tracking status without signing up. To save a
        watch and get email alerts, an account is needed so we can attach the
        watch to a verified email address.
      </>
    ),
    aText:
      "You can view a tracking status without signing up. To save a watch and get email alerts, an account is needed so we can attach the watch to a verified email address.",
  },
  {
    q: "Is my password safe?",
    a: (
      <>
        We store a PBKDF2-SHA256 hash with a per-account random salt (100,000
        iterations — the maximum the Cloudflare Workers runtime allows). We
        never see your raw password. Use a password manager.
      </>
    ),
    aText:
      "We store a PBKDF2-SHA256 hash with a per-account random salt (100,000 iterations — the maximum the Cloudflare Workers runtime allows). We never see your raw password. Use a password manager.",
  },
  {
    q: "What happens to a watch after the package is delivered?",
    a: (
      <>
        The watch is automatically marked terminal (delivered / returned) and
        we stop polling. You can leave it in your dashboard for reference or
        cancel it.
      </>
    ),
    aText:
      "The watch is automatically marked terminal (delivered / returned) and we stop polling. You can leave it in your dashboard for reference or cancel it.",
  },
  {
    q: "How do I stop getting alerts?",
    a: (
      <>
        Every alert email has a one-click unsubscribe link. You can also
        cancel a watch from the dashboard, or delete your account by emailing{" "}
        <a href="mailto:aswin@aswincloud.com">aswin@aswincloud.com</a>.
      </>
    ),
    aText:
      "Every alert email has a one-click unsubscribe link. You can also cancel a watch from the dashboard, or delete your account by emailing aswin@aswincloud.com.",
  },
  {
    q: "Where does the tracking data come from?",
    a: (
      <>
        Blue Dart and Shiprocket are read from their public tracking pages —
        no paid aggregator. Delhivery is the exception: it has no
        credential-free public page, so we use Delhivery&apos;s official API,
        which only returns shipments booked under our own Delhivery account.
        That means an arbitrary Delhivery AWB won&apos;t resolve here yet — but
        most Delhivery e-commerce parcels can be tracked via Shiprocket.
      </>
    ),
    aText:
      "Blue Dart and Shiprocket are read from their public tracking pages — no paid aggregator. Delhivery is the exception: it has no credential-free public page, so we use Delhivery's official API, which only returns shipments booked under our own Delhivery account. An arbitrary Delhivery AWB won't resolve here yet, but most Delhivery e-commerce parcels can be tracked via Shiprocket.",
  },
  {
    q: "Can I add another carrier?",
    a: (
      <>
        Yes — the carrier system is pluggable. Open an issue or PR on{" "}
        <a href="https://github.com/Aswincloud/shiptrack">GitHub</a> with the
        carrier name and a public tracking-page URL.
      </>
    ),
    aText:
      "Yes — the carrier system is pluggable. Open an issue or PR on GitHub with the carrier name and a public tracking-page URL.",
  },
  {
    q: "Can I self-host my own copy?",
    a: (
      <>
        Absolutely. The code is MIT-licensed and runs on Cloudflare Workers +
        D1 + Resend. See the{" "}
        <a href="https://github.com/Aswincloud/shiptrack#readme">README</a>{" "}
        for setup.
      </>
    ),
    aText:
      "Absolutely. The code is MIT-licensed and runs on Cloudflare Workers + D1 + Resend. See the README for setup.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: QA.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.aText },
  })),
};

export default function FaqPage() {
  return (
    <PolicyLayout title="FAQ" subtitle="Common questions about ShipTrack.">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {QA.map((item, i) => (
          <details
            key={i}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 8,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <summary
              style={{
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--fg)",
                fontSize: 15,
                listStyle: "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span>{item.q}</span>
              <span aria-hidden style={{ color: "var(--muted)", fontSize: 18 }}>+</span>
            </summary>
            <div style={{ marginTop: 12, color: "var(--fg-soft)" }}>{item.a}</div>
          </details>
        ))}
      </div>

      <p style={{ ...pStyle, marginTop: 32, color: "var(--muted)", fontSize: 13 }}>
        <Link href="/">← Back to ShipTrack</Link>
      </p>
    </PolicyLayout>
  );
}
