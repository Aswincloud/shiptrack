export interface EmailEnv {
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  APP_URL: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(env: EmailEnv, args: SendArgs): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}

const APP_URL = "https://shiptrack.aswincloud.com";

// ---------------------------------------------------------------------------
// Email shell — table-based, inline-styled layout that renders consistently
// across Gmail, Apple Mail, Outlook, etc. Email clients don't support flexbox,
// CSS variables, or most modern CSS, so everything here is deliberately old.
// ---------------------------------------------------------------------------

interface ShellOptions {
  preheader?: string; // hidden inbox-preview text
  heading: string;
  accent?: string; // hex for the heading accent bar
  bodyHtml: string; // inner content (already escaped where needed)
}

function shell(opts: ShellOptions): string {
  const accent = opts.accent ?? "#6366f1";
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(
        opts.preheader,
      )}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;-webkit-font-smoothing:antialiased;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">

        <!-- Brand header -->
        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td width="36" height="36" align="center" valign="middle"
                        style="width:36px;height:36px;background:${accent};background-image:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:9px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;text-align:center;">S</td>
                    <td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">ShipTrack</td>
                  </tr></table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <!-- accent bar -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td height="4" style="height:4px;background:${accent};background-image:linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899);font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;font-size:15px;line-height:1.6;">
                  <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${escapeHtml(
                    opts.heading,
                  )}</h1>
                  ${opts.bodyHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 8px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
            <a href="${APP_URL}" style="color:#94a3b8;text-decoration:none;">ShipTrack</a> — free, open-source shipment tracking.<br>
            <a href="${APP_URL}/faq" style="color:#94a3b8;text-decoration:underline;">FAQ</a> &nbsp;·&nbsp;
            <a href="${APP_URL}/privacy" style="color:#94a3b8;text-decoration:underline;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://github.com/Aswincloud/shiptrack" style="color:#94a3b8;text-decoration:underline;">GitHub</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Pill colors mirror the web app's semantic palette.
function statusColors(status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (s.includes("deliver") && !s.includes("undeliver") && !s.includes("out")) return { bg: "#ecfdf5", fg: "#059669" };
  if (s.includes("out for")) return { bg: "#f0f9ff", fg: "#0284c7" };
  if (s.includes("return") || s.includes("exception") || s.includes("undeliver") || s.includes("cancel"))
    return { bg: "#fff1f2", fg: "#e11d48" };
  if (s.includes("transit") || s.includes("picked") || s.includes("pickup")) return { bg: "#fffbeb", fg: "#d97706" };
  return { bg: "#f1f5f9", fg: "#475569" };
}

function statusPill(status: string): string {
  const { bg, fg } = statusColors(status);
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:13px;font-weight:600;padding:5px 12px;border-radius:999px;">${escapeHtml(
    humanStatus(status),
  )}</span>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr>
    <td align="center" bgcolor="#6366f1" style="background:#6366f1;background-image:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:12px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(
        label,
      )}</a>
    </td>
  </tr></table>`;
}

// A compact shipment "info card" used in alert + watch-created emails.
function shipmentCard(args: { carrier: string; trackingNumber: string; label?: string | null }): string {
  const labelRow = args.label
    ? `<tr><td style="padding:2px 0;color:#94a3b8;font-size:13px;">Label</td><td style="padding:2px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(
        args.label,
      )}</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:4px 0 8px;">
    <tr><td style="padding:14px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:2px 0;color:#94a3b8;font-size:13px;">Carrier</td><td style="padding:2px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(
          humanStatus(args.carrier),
        )}</td></tr>
        <tr><td style="padding:2px 0;color:#94a3b8;font-size:13px;">Tracking #</td><td style="padding:2px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(
          args.trackingNumber,
        )}</td></tr>
        ${labelRow}
      </table>
    </td></tr>
  </table>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function confirmEmail(args: {
  appUrl: string;
  confirmUrl: string;
  carrier: string;
  trackingNumber: string;
  label?: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `Confirm your ShipTrack alert for ${args.trackingNumber}`;
  const html = shell({
    preheader: "Confirm to start receiving status alerts for this shipment.",
    heading: "Confirm your alert",
    bodyHtml: `
      <p style="margin:0 0 16px;">You'll get an email whenever the status of this shipment changes.</p>
      ${shipmentCard(args)}
      ${button(args.confirmUrl, "Confirm alert")}
      <p style="margin:18px 0 0;color:#94a3b8;font-size:13px;">Didn't request this? You can safely ignore this email.</p>
    `,
  });
  const text = `Confirm your ShipTrack alert: ${args.confirmUrl}`;
  return { subject, html, text };
}

export function statusChangeEmail(args: {
  carrier: string;
  trackingNumber: string;
  label?: string | null;
  oldStatus: string | null;
  newStatus: string;
  description: string;
  location?: string;
  timestamp?: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const ref = args.label ?? args.trackingNumber;
  const subject = `${ref}: ${humanStatus(args.newStatus)}`;
  const meta = [args.timestamp, args.location].filter(Boolean).join(" · ");
  const { fg } = statusColors(args.newStatus);

  const html = shell({
    preheader: `${humanStatus(args.newStatus)} — ${args.description}`,
    heading: "Shipment update",
    accent: fg,
    bodyHtml: `
      <p style="margin:0 0 14px;">${statusPill(args.newStatus)}${
        args.oldStatus
          ? `<span style="color:#94a3b8;font-size:13px;padding-left:10px;">was ${escapeHtml(humanStatus(args.oldStatus))}</span>`
          : ""
      }</p>
      ${shipmentCard(args)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
        <tr><td style="padding:14px 18px;background:#ffffff;border-left:3px solid ${fg};background:#f8fafc;border-radius:8px;">
          <div style="color:#0f172a;font-size:15px;font-weight:600;">${escapeHtml(args.description)}</div>
          ${meta ? `<div style="color:#94a3b8;font-size:13px;margin-top:4px;">${escapeHtml(meta)}</div>` : ""}
        </td></tr>
      </table>
      <p style="margin:22px 0 0;">${button(`${APP_URL}/dashboard`, "View all shipments")}</p>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;">
        <a href="${args.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Stop alerts for this shipment</a>
      </p>
    `,
  });
  const text = `${humanStatus(args.newStatus)}: ${args.description}${meta ? ` (${meta})` : ""}\nUnsubscribe: ${args.unsubscribeUrl}`;
  return { subject, html, text };
}

export function otpEmail(args: { code: string; ttlMinutes: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your ShipTrack verification code: ${args.code}`;
  const html = shell({
    preheader: `Your verification code is ${args.code}.`,
    heading: "Verify your email",
    bodyHtml: `
      <p style="margin:0 0 18px;">Enter this code to finish signing up for ShipTrack:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:22px;">
          <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:38px;font-weight:700;letter-spacing:10px;color:#0f172a;">${escapeHtml(
            args.code,
          )}</span>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:13px;">This code expires in ${args.ttlMinutes} minutes. If you didn't try to sign up, you can ignore this email.</p>
    `,
  });
  const text = `Your ShipTrack verification code: ${args.code} (expires in ${args.ttlMinutes} minutes)`;
  return { subject, html, text };
}

export function watchCreatedEmail(args: {
  appUrl: string;
  carrier: string;
  trackingNumber: string;
  label?: string | null;
  currentStatus?: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const ref = args.label ? `${args.label} (${args.trackingNumber})` : args.trackingNumber;
  const subject = `Now watching ${ref}`;
  const statusLine = args.currentStatus
    ? `<p style="margin:0 0 14px;">Current status: ${statusPill(args.currentStatus)}</p>`
    : "";
  const html = shell({
    preheader: "We'll email you whenever this shipment's status changes.",
    heading: "You're watching this shipment",
    accent: "#059669",
    bodyHtml: `
      <p style="margin:0 0 14px;">Great — we'll email you whenever the status changes.</p>
      ${statusLine}
      ${shipmentCard(args)}
      ${button(`${args.appUrl}/dashboard`, "Open dashboard")}
      <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;">
        Not what you wanted? <a href="${args.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Stop watching this shipment</a>.
      </p>
    `,
  });
  const text = `Now watching ${args.carrier} ${args.trackingNumber}. We'll email you on status changes. Stop: ${args.unsubscribeUrl}`;
  return { subject, html, text };
}

export function accountDeletedEmail(args: { appUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Your ShipTrack account was deleted";
  const html = shell({
    preheader: "Your account and its watches were removed.",
    heading: "Your account was deleted",
    accent: "#e11d48",
    bodyHtml: `
      <p style="margin:0 0 14px;">An administrator removed your ShipTrack account. All watches tied to it have been cancelled and no further alerts will be sent.</p>
      <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">If you think this was a mistake, you can sign up again any time.</p>
      ${button(args.appUrl, "Back to ShipTrack")}
    `,
  });
  const text = `Your ShipTrack account was deleted by an admin. All watches were cancelled. Sign up again at ${args.appUrl} if needed.`;
  return { subject, html, text };
}

export function newSignupAdminEmail(args: {
  newUserEmail: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `New ShipTrack signup: ${args.newUserEmail}`;
  const html = shell({
    preheader: `${args.newUserEmail} just signed up.`,
    heading: "New user signed up",
    bodyHtml: `
      <p style="margin:0 0 14px;"><strong style="color:#0f172a;">${escapeHtml(
        args.newUserEmail,
      )}</strong> just started the signup flow.</p>
      <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">They're unverified until they enter the OTP we sent them.</p>
      ${button(`${args.appUrl}/dashboard`, "Open admin dashboard")}
    `,
  });
  const text = `New ShipTrack signup: ${args.newUserEmail}. Open ${args.appUrl}/dashboard.`;
  return { subject, html, text };
}

export function passwordResetEmail(args: {
  resetUrl: string;
  ttlHours: number;
}): { subject: string; html: string; text: string } {
  const subject = "Reset your ShipTrack password";
  const html = shell({
    preheader: "Use the button below to choose a new password.",
    heading: "Reset your password",
    bodyHtml: `
      <p style="margin:0 0 18px;">Click below to choose a new password for your ShipTrack account.</p>
      ${button(args.resetUrl, "Reset password")}
      <p style="margin:18px 0 0;color:#94a3b8;font-size:13px;">This link expires in ${args.ttlHours} hour${
        args.ttlHours === 1 ? "" : "s"
      }. Didn't request this? You can ignore this email — your password won't change.</p>
    `,
  });
  const text = `Reset your ShipTrack password: ${args.resetUrl} (expires in ${args.ttlHours}h)`;
  return { subject, html, text };
}

// Self-service email change: a confirm link sent to the NEW address. Clicking
// it proves the user controls that mailbox, and the change applies. Replaces
// the old admin-approval flow.
export function emailChangeConfirmEmail(args: {
  confirmUrl: string;
  newEmail: string;
  ttlHours: number;
}): { subject: string; html: string; text: string } {
  const subject = "Confirm your new ShipTrack email";
  const html = shell({
    preheader: "Confirm this address to finish changing your ShipTrack email.",
    heading: "Confirm your new email",
    accent: "#059669",
    bodyHtml: `
      <p style="margin:0 0 14px;">Confirm that <strong>${escapeHtml(
        args.newEmail,
      )}</strong> is your new ShipTrack login email.</p>
      ${button(args.confirmUrl, "Confirm new email")}
      <p style="margin:18px 0 0;color:#94a3b8;font-size:13px;">This link expires in ${args.ttlHours} hour${
        args.ttlHours === 1 ? "" : "s"
      }. Didn't request this? You can ignore this email — your address won't change.</p>
    `,
  });
  const text = `Confirm your new ShipTrack email (${args.newEmail}): ${args.confirmUrl} (expires in ${args.ttlHours}h)`;
  return { subject, html, text };
}

function humanStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
