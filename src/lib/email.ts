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

export function confirmEmail(args: {
  appUrl: string;
  confirmUrl: string;
  carrier: string;
  trackingNumber: string;
  label?: string | null;
}): { subject: string; html: string; text: string } {
  const labelLine = args.label ? `<p><strong>Label:</strong> ${escapeHtml(args.label)}</p>` : "";
  const subject = `Confirm your ShipTrack alert for ${args.trackingNumber}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Confirm your ShipTrack alert</h2>
      <p>You'll get an email whenever the status of this shipment changes:</p>
      <p><strong>${escapeHtml(args.carrier)}</strong> · <code>${escapeHtml(args.trackingNumber)}</code></p>
      ${labelLine}
      <p style="margin:24px 0">
        <a href="${args.confirmUrl}" style="background:#4f9eff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirm alert</a>
      </p>
      <p style="color:#666;font-size:13px">Didn't request this? Just ignore the email.</p>
    </div>
  `;
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
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">${escapeHtml(humanStatus(args.newStatus))}</h2>
      <p><strong>${escapeHtml(args.carrier)}</strong> · <code>${escapeHtml(args.trackingNumber)}</code></p>
      ${args.label ? `<p><strong>Label:</strong> ${escapeHtml(args.label)}</p>` : ""}
      <p style="margin:16px 0;padding:12px;background:#f4f6f8;border-radius:8px">
        ${escapeHtml(args.description)}
        ${meta ? `<br><span style="color:#666;font-size:13px">${escapeHtml(meta)}</span>` : ""}
      </p>
      ${args.oldStatus ? `<p style="color:#666;font-size:13px">Previously: ${escapeHtml(humanStatus(args.oldStatus))}</p>` : ""}
      <p style="margin-top:32px;color:#666;font-size:12px">
        <a href="${args.unsubscribeUrl}" style="color:#666">Stop alerts for this shipment</a>
      </p>
    </div>
  `;
  const text = `${humanStatus(args.newStatus)}: ${args.description}\nUnsubscribe: ${args.unsubscribeUrl}`;
  return { subject, html, text };
}

export function otpEmail(args: {
  code: string;
  ttlMinutes: number;
}): { subject: string; html: string; text: string } {
  const subject = `Your ShipTrack verification code: ${args.code}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Use this code to finish signing up for ShipTrack:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f4f6f8;padding:16px 20px;border-radius:8px;text-align:center;margin:20px 0">
        ${args.code}
      </p>
      <p style="color:#666;font-size:13px">The code expires in ${args.ttlMinutes} minutes. If you didn't try to sign up, you can ignore this email.</p>
    </div>
  `;
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
  const labelLine = args.label ? `<p style="margin:8px 0"><strong>Label:</strong> ${escapeHtml(args.label)}</p>` : "";
  const statusLine = args.currentStatus
    ? `<p style="margin:8px 0"><strong>Current status:</strong> ${escapeHtml(humanStatus(args.currentStatus))}</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">You're watching this shipment</h2>
      <p>We'll email you whenever the status changes.</p>
      <p style="margin:8px 0"><strong>${escapeHtml(args.carrier)}</strong> · <code>${escapeHtml(args.trackingNumber)}</code></p>
      ${labelLine}
      ${statusLine}
      <p style="margin:24px 0">
        <a href="${args.appUrl}/dashboard" style="background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open dashboard</a>
      </p>
      <p style="margin-top:32px;color:#666;font-size:12px">
        Not what you wanted? <a href="${args.unsubscribeUrl}" style="color:#666">Stop watching this shipment</a>.
      </p>
    </div>
  `;
  const text = `Now watching ${args.carrier} ${args.trackingNumber}. We'll email you on status changes. Stop: ${args.unsubscribeUrl}`;
  return { subject, html, text };
}

export function accountDeletedEmail(args: {
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your ShipTrack account was deleted";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Your account was deleted</h2>
      <p>An administrator removed your ShipTrack account. All watches tied to it have been cancelled and no further alerts will be sent.</p>
      <p style="color:#666;font-size:13px">If you think this was a mistake, you can sign up again at <a href="${args.appUrl}">${args.appUrl}</a>.</p>
    </div>
  `;
  const text = `Your ShipTrack account was deleted by an admin. All watches were cancelled. Sign up again at ${args.appUrl} if needed.`;
  return { subject, html, text };
}

export function newSignupAdminEmail(args: {
  newUserEmail: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `New ShipTrack signup: ${args.newUserEmail}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">New user signed up</h2>
      <p><strong>${escapeHtml(args.newUserEmail)}</strong> just started the signup flow.</p>
      <p style="color:#666;font-size:13px">They&apos;re unverified until they enter the OTP we sent them. <a href="${args.appUrl}/dashboard">Open the admin dashboard</a>.</p>
    </div>
  `;
  const text = `New ShipTrack signup: ${args.newUserEmail}. Open ${args.appUrl}/dashboard.`;
  return { subject, html, text };
}

export function passwordResetEmail(args: {
  resetUrl: string;
  ttlHours: number;
}): { subject: string; html: string; text: string } {
  const subject = "Reset your ShipTrack password";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p>Click below to choose a new password:</p>
      <p style="margin:24px 0">
        <a href="${args.resetUrl}" style="background:#4f9eff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a>
      </p>
      <p style="color:#666;font-size:13px">This link expires in ${args.ttlHours} hour${args.ttlHours === 1 ? "" : "s"}. Didn't request this? Ignore the email.</p>
    </div>
  `;
  const text = `Reset your ShipTrack password: ${args.resetUrl} (expires in ${args.ttlHours}h)`;
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
