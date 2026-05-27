# ShipTrack

Free, open-source shipment tracking for Indian and international couriers. Built with Next.js + TypeScript.

Currently supports:

- **Blue Dart** (India)

More carriers coming — contributions welcome.

## Why

Most courier tracking lives behind paid SaaS aggregators. ShipTrack is a tiny, self-hostable alternative: bring your own carrier credentials and run it on Vercel, Cloudflare, or your own box.

## Quick start

```bash
git clone https://github.com/aswin/shiptrack
cd shiptrack
npm install
cp .env.example .env.local
# fill in carrier credentials
npm run dev
```

Open <http://localhost:3000>.

## API

```
GET /api/carriers
GET /api/track/{carrier}/{trackingNumber}
```

Example:

```bash
curl http://localhost:3000/api/track/bluedart/1234567890
```

Response shape: see [`src/carriers/types.ts`](src/carriers/types.ts).

## Carrier credentials

### Blue Dart

Request API access at <https://apigateway.bluedart.com/>. Once approved, set:

```
BLUEDART_LICENSE_KEY=...
BLUEDART_LOGIN_ID=...
BLUEDART_API_KEY=...
BLUEDART_ENV=staging   # or "prod"
```

Blue Dart's API doesn't publish hard rate limits but returns HTTP 429 when exceeded. Polling once per 15–30 minutes per shipment is plenty.

## Adding a carrier

1. Create `src/carriers/<name>.ts` exporting a `Carrier` (see `types.ts`).
2. Register it in `src/carriers/registry.ts`.
3. Document any required env vars in `.env.example` and this README.

That's it — the API route and UI pick it up automatically.

## Alerts

Users can register a tracking number + email and get notified whenever the carrier's status changes:

1. Submit email + tracking number from the UI.
2. Click the confirmation link in the email.
3. A scheduled worker polls every 15 minutes, diffs against the last known event, and sends an email via Resend on change.
4. Every notification email has a one-click unsubscribe link.

Notifier registry (`src/notifiers/`) is pluggable — email is implemented, `webhook` / `sms` / `slack` / `telegram` are registered stubs for future PRs.

### Setup

```bash
# 1. Create the D1 database
npx wrangler d1 create shiptrack
# Copy the `database_id` into BOTH wrangler.jsonc and wrangler.poller.jsonc

# 2. Apply schema (local + remote)
npm run db:migrate
npm run db:migrate:remote

# 3. Set secrets on the web worker
for k in TOKEN_SECRET RESEND_API_KEY RESEND_FROM APP_URL \
         BLUEDART_LICENSE_KEY BLUEDART_LOGIN_ID BLUEDART_API_KEY BLUEDART_ENV; do
  npx wrangler secret put "$k"
done

# 4. Set the same secrets on the poller
for k in TOKEN_SECRET RESEND_API_KEY RESEND_FROM APP_URL \
         BLUEDART_LICENSE_KEY BLUEDART_LOGIN_ID BLUEDART_API_KEY BLUEDART_ENV; do
  npx wrangler secret put "$k" -c wrangler.poller.jsonc
done

# 5. Deploy both
npm run deploy
```

`TOKEN_SECRET` should be a random 32-byte hex string (`openssl rand -hex 32`). `RESEND_FROM` must be a verified sender in your Resend account.

## Deploy to Cloudflare Workers

This repo is configured for [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm install
npx wrangler login
npm run deploy
```

Set carrier secrets on the deployed worker (not committed):

```bash
npx wrangler secret put BLUEDART_LICENSE_KEY
npx wrangler secret put BLUEDART_LOGIN_ID
npx wrangler secret put BLUEDART_API_KEY
npx wrangler secret put BLUEDART_ENV   # "prod" or "staging"
```

Local Workers preview (runs the actual worker bundle):

```bash
npm run preview
```

## License

MIT — see [LICENSE](LICENSE).
