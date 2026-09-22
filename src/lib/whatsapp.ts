// WhatsApp Cloud API (Meta Graph): outbound template sends, in-window text
// replies, and inbound webhook handling.
//
// Business-initiated WhatsApp messages must use a pre-approved template; free
// text is only allowed inside the 24h window after the customer writes first.
// So shipment alerts go out as the `tracking_update` utility template, and the
// only free-text we ever send is a reply to something the user just sent us
// (linking confirmation, STOP/START acknowledgement).
//
// Kept free of any app import so it can be unit-tested standalone and shared by
// both workers. Callers decide what goes in each parameter; this module only
// sanitises them to what Meta accepts and speaks the wire protocol.

export interface WhatsAppEnv {
  WHATSAPP_PHONE_NUMBER_ID?: string; // the sending number's Graph object id (not the number itself)
  WHATSAPP_ACCESS_TOKEN?: string; // permanent System User token with whatsapp_business_messaging
  WHATSAPP_TEMPLATE_NAME?: string; // utility template for alerts; default "tracking_update"
  WHATSAPP_TEMPLATE_LANG?: string; // must match the template's language exactly; default "en"
  WHATSAPP_BUSINESS_NUMBER?: string; // E.164 digits of the business number users message to link
  WHATSAPP_APP_SECRET?: string; // Meta app secret; validates X-Hub-Signature-256 on webhooks
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string; // the string pasted into Meta's webhook config
  WHATSAPP_API_BASE?: string; // override for tests / proxies; default https://graph.facebook.com
}

// Graph API versions stay callable for ~2 years after release; bump deliberately.
const GRAPH_VERSION = "v21.0";
const DEFAULT_API_BASE = "https://graph.facebook.com";
export const DEFAULT_TEMPLATE_NAME = "tracking_update";
export const DEFAULT_TEMPLATE_LANG = "en";

// Order of the positional parameters in the `tracking_update` template body:
//   Hi {{1}}, There is an update on your shipment {{2}}. 📍 {{3}} 🕐 {{4}} {{5}}
export interface TrackingUpdateParams {
  name: string; // {{1}}
  shipment: string; // {{2}}
  location: string; // {{3}}
  time: string; // {{4}}
  status: string; // {{5}}
}

export type WhatsAppErrorCode =
  | "not_configured"
  | "invalid_recipient" // number isn't on WhatsApp, or (dev mode) not in the allowed list
  | "template_unavailable" // not approved yet, paused, disabled, or parameters don't match
  | "rate_limited"
  | "upstream_error";

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly code: WhatsAppErrorCode,
    public readonly metaCode?: number,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

/** True when outbound sends can be attempted. */
export function whatsappConfigured(env: WhatsAppEnv): boolean {
  return !!(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);
}

/** True when the "message us to link" flow can work: sends + a number to message + a verifiable webhook. */
export function whatsappLinkingConfigured(env: WhatsAppEnv): boolean {
  return (
    whatsappConfigured(env) &&
    !!env.WHATSAPP_BUSINESS_NUMBER &&
    !!env.WHATSAPP_APP_SECRET &&
    !!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  );
}

/** "919876543210" -> "+91 9876543210" for display. Country-code split is best-effort. */
export function formatPhoneForDisplay(digits: string): string {
  const cc = digits.startsWith("1") || digits.startsWith("7") ? 1 : digits.length > 10 ? digits.length - 10 : 2;
  return `+${digits.slice(0, cc)} ${digits.slice(cc)}`;
}

/**
 * Meta rejects parameters containing newlines or tabs, or more than four
 * consecutive spaces, and caps the rendered body at 1024 chars. Collapse every
 * whitespace run (\s covers newlines, tabs and the Unicode line separators) to
 * one space, trim, cap, and never return an empty string — an empty parameter
 * is a hard error, so fall back to a visible placeholder.
 */
export function sanitizeParam(value: string | null | undefined, max = 80, fallback = "-"): string {
  const s = (value ?? "").replace(/\s+/g, " ").trim();
  if (!s) return fallback;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
}

function classify(httpStatus: number, body: GraphErrorBody | null): WhatsAppError {
  const e = body?.error;
  const code = e?.code;
  const detail = e?.error_data?.details ?? e?.message ?? `HTTP ${httpStatus}`;
  // Template lifecycle / shape problems — nothing a retry fixes; the operator
  // has to act in Business Manager (or the template is still in review).
  if (code === 132001 || code === 132015 || code === 132016 || code === 132012 || code === 132000 || code === 132007) {
    return new WhatsAppError(`WhatsApp template unavailable: ${detail}`, "template_unavailable", code);
  }
  // Recipient problems (not on WhatsApp; dev-mode allow-list; re-engagement window).
  if (code === 131026 || code === 131030 || code === 131021 || code === 131009 || code === 131047) {
    return new WhatsAppError(`WhatsApp recipient rejected: ${detail}`, "invalid_recipient", code);
  }
  // Throttling — Meta's own (130429; 131056 pair rate limit) and generic Graph (4, 17, 32, 613).
  if (httpStatus === 429 || code === 130429 || code === 131056 || code === 4 || code === 17 || code === 32 || code === 613) {
    return new WhatsAppError(`WhatsApp rate limited: ${detail}`, "rate_limited", code);
  }
  // Bad/expired token, missing permission, unknown phone-number id.
  if (code === 190 || code === 10 || code === 100 || httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppError(`WhatsApp not configured correctly: ${detail}`, "not_configured", code);
  }
  return new WhatsAppError(`WhatsApp upstream error: ${detail}`, "upstream_error", code);
}

async function post(env: WhatsAppEnv, message: Record<string, unknown>): Promise<string> {
  if (!whatsappConfigured(env)) throw new WhatsAppError("WhatsApp is not configured", "not_configured");
  const base = (env.WHATSAPP_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const url = `${base}/${GRAPH_VERSION}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
  });
  const json = (await res.json().catch(() => null)) as (GraphErrorBody & { messages?: { id: string }[] }) | null;
  if (!res.ok) throw classify(res.status, json);
  const id = json?.messages?.[0]?.id;
  if (!id) throw new WhatsAppError("WhatsApp returned no message id", "upstream_error");
  return id;
}

interface TemplateComponent {
  type: "body" | "button";
  sub_type?: "url" | "copy_code" | "quick_reply";
  index?: string;
  parameters: { type: "text"; text: string }[];
}

/** Low-level template send. Returns Meta's message id. Throws WhatsAppError. */
export function sendTemplate(
  env: WhatsAppEnv,
  args: { to: string; template: string; lang: string; components: TemplateComponent[] },
): Promise<string> {
  return post(env, {
    to: args.to,
    type: "template",
    template: { name: args.template, language: { code: args.lang }, components: args.components },
  });
}

/** Shipment alert via the utility template. Parameters are sanitised here. */
export function sendTrackingUpdate(env: WhatsAppEnv, to: string, p: TrackingUpdateParams): Promise<string> {
  const params = [
    sanitizeParam(p.name, 40, "there"),
    sanitizeParam(p.shipment, 60),
    sanitizeParam(p.location, 60),
    sanitizeParam(p.time, 40),
    sanitizeParam(p.status, 120),
  ];
  return sendTemplate(env, {
    to,
    template: env.WHATSAPP_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME,
    lang: env.WHATSAPP_TEMPLATE_LANG || DEFAULT_TEMPLATE_LANG,
    components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
  });
}

/**
 * Free-form text. Only deliverable inside the 24h customer-service window that
 * opens when the user messages us — which is exactly when we use it (replying
 * to a link code or a STOP). Service-window replies are not billed.
 */
export function sendText(env: WhatsAppEnv, to: string, body: string): Promise<string> {
  return post(env, { to, type: "text", text: { preview_url: false, body: sanitizeParam(body, 1000) } });
}

// ---------------------------------------------------------------------------
// Linking ("message us first")
// ---------------------------------------------------------------------------

export const LINK_KEYWORD = "VERIFY";

/** The message a user sends to link their number. */
export function linkMessageText(code: string): string {
  return `${LINK_KEYWORD} ${code}`;
}

/** wa.me deep link that opens WhatsApp on the business number with the link text pre-filled. */
export function buildWaLink(businessNumber: string, code: string): string {
  return `https://wa.me/${businessNumber.replace(/\D/g, "")}?text=${encodeURIComponent(linkMessageText(code))}`;
}

/**
 * Pull a link code out of an inbound message: the VERIFY keyword (any case)
 * plus a run of exactly six digits, in any order, with any punctuation. The
 * keyword is required: our number is also the support line, where customers
 * type order numbers and one-time codes all day, and a bare six digits must
 * never be mistaken for a link attempt. The wa.me link pre-fills both parts.
 */
export function parseLinkCode(text: string): string | null {
  if (!/\bverify\b/i.test(text)) return null;
  const m = text.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

// Opt-out / opt-in keywords. The whole message, nothing else: our number is
// also the support line, and "cancel my order" or "stop sending me the wrong
// item" must never flip somebody's shipment alerts. Chatwoot's bot skips
// exactly these same forms (offhours-bot/app.py) so a customer gets one reply.
export function isStopMessage(text: string): boolean {
  return /^\W*(stop|unsubscribe)\W*$/i.test(text);
}

export function isStartMessage(text: string): boolean {
  return /^\W*(start|subscribe|resume)\W*$/i.test(text);
}

// ---------------------------------------------------------------------------
// Inbound webhook
// ---------------------------------------------------------------------------

/**
 * Meta signs every webhook POST: X-Hub-Signature-256 = "sha256=" + hex HMAC of
 * the raw body with the app secret. Anything unsigned or mis-signed is not from
 * Meta. Constant-time compare so the check can't be timed.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const actualHex = Array.from(sig)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

export interface InboundMessage {
  id: string;
  from: string; // sender, E.164 digits
  phoneNumberId: string; // which of our numbers received it
  type: string;
  text: string | null; // body for type "text"; null otherwise
  timestamp: number; // unix seconds
  profileName?: string;
}

interface WebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/** Flatten Meta's nested webhook envelope into the user messages it carries (delivery statuses are dropped). */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const p = payload as WebhookPayload | null;
  if (!p || p.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return out;
  for (const entry of p.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const v = change.value;
      if (!v || v.messaging_product !== "whatsapp") continue;
      const names = new Map<string, string>();
      for (const c of v.contacts ?? []) if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        out.push({
          id: m.id,
          from: m.from.replace(/\D/g, ""),
          phoneNumberId: v.metadata?.phone_number_id ?? "",
          type: m.type ?? "unknown",
          text: m.type === "text" ? (m.text?.body ?? "") : null,
          timestamp: Number(m.timestamp) || Math.floor(Date.now() / 1000),
          profileName: names.get(m.from),
        });
      }
    }
  }
  return out;
}
