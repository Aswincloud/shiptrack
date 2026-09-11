# ShipTrack

Free, open-source shipment tracking for Indian and international couriers. Built with Next.js + TypeScript.

Currently supports:

- **Blue Dart** (India)
- **Delhivery** (India)
- **ST Courier** (India)
- **The Professional Couriers** (India)
- **Shiprocket** (any courier shipped via Shiprocket)

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

No credentials required. The carrier scrapes the public tracking page at
`https://www.bluedart.com/trackdartresultthirdparty`, which renders all
shipment data server-side.

Blue Dart's commercial tracking API is gated behind customer credentials
issued by a Blue Dart account manager; a DHL Developer Portal app on its
own is not sufficient. If you have such credentials and want to switch to
the official API, the prior version of `src/carriers/bluedart.ts` in git
history shows the request shape.

Polling every 15–30 minutes per shipment is plenty.

### ST Courier

No credentials required. ST Courier publishes no developer API, so the carrier
replicates the two-step flow their own site uses:

1. `POST https://stcourier.com/track/doCheck` with form field `awb_no`, which
   stores the AWB against a new `ci_session` and returns only
   `{"code":200,"msg":"Track Shipment"}`.
2. `GET https://stcourier.com/track/shipment` carrying that cookie, which
   renders the summary table and scan timeline server-side.

The AWB lives in the session rather than the URL, so step 2 without the cookie
from step 1 just returns the empty search form. Not-found is signalled by the
absence of the "Status of AWB No." heading — the page still returns HTTP 200.

AWBs are numeric and capped at 11 digits by their form. ST Courier exposes no
expected-delivery date, so `estimatedDelivery` is always unset.

### The Professional Couriers (TPC)

No credentials required. TPC's website tracker sits behind an image captcha,
but the plain-text feed their mobile app reads does not:

```
GET https://www.tpcindia.com/TPCWebService/TrackMobDe.ashx?podno=<CONSIGNMENT>
```

It returns one block per scan (newest first) with a `DD/MM/YYYY` date, `Time`,
`City`, `WayNo` and `Activity` line. An unknown or malformed number still
answers HTTP 200 with just the `Forwarding Details :` header, which the carrier
reports as `not_found`.

The feed has no summary status, origin, destination or expected-delivery date,
so `status` is derived from the newest activity text and `estimatedDelivery`
is always unset. TPC often records the same scan twice under different
`WayNo` bag references; those duplicates are collapsed.

TPC also exposes `/TPCWebService/Track.ashx?client=&podno=&tpcpwd=`, gated by
a corporate login issued by a TPC branch. Its response format is undocumented
and it is not used.

### Delhivery

No credentials required, but one is worth setting. Delhivery is tracked from two
sources, best-first:

1. **Account API** — used when `DELHIVERY_API_TOKEN` is set. Returns a full,
   dated scan history, but only for shipments booked under that account.
2. **Public feed** — used for everything else, including when no token is set.
   This is the endpoint delhivery.com's own tracking page calls, and it needs no
   credentials; the only gate is an `Origin: https://www.delhivery.com` header
   (without it: `401 ERROR: Invalid Origin`).

The public feed carries the current status and the expected delivery date, but
its per-scan `scanDate` / `scanDateTime` fields come back empty — only top-level
`status.statusDateTime` is reliably dated, so that always becomes the newest
event. Undated scans are still surfaced for their location and remark.

Setting the token therefore buys richer history for your own shipments; without
it every AWB still resolves. A rejected or rate-limited token falls through to
the public feed rather than failing the request.

Waybills are numeric. The public feed accepts 11-14 digits and answers `400` to
anything shorter or containing letters, which this carrier reports as
`not_found`.

## Adding a carrier

1. Create `src/carriers/<name>.ts` exporting a `Carrier` (see `types.ts`).
2. Register it in `src/carriers/registry.ts`.
3. Document any required env vars in `.env.example` and this README.

That's it — the API route and UI pick it up automatically.

## Alerts (owner-only for now)

The site is read-only for visitors — anyone can paste a tracking number and see the current status. Scheduled alerts are gated behind an `ADMIN_TOKEN`, so only the operator can register a watch. Public signup + per-user accounts will come later.

When a watch is active, a scheduled worker polls every 15 minutes, diffs the latest event, and emails the configured address via Resend on any change. Every alert email has a one-click unsubscribe link.

Notifier registry (`src/notifiers/`) is pluggable — email (Resend) is implemented; `webhook` / `sms` / `slack` / `telegram` are registered stubs for later.

### Add / remove a watch (curl)

```bash
# Add
curl -X POST https://your-app.workers.dev/api/watches \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "carrier": "bluedart",
    "trackingNumber": "1234567890",
    "label": "Mom’s package"
  }'

# Cancel — open the unsubscribe link from any alert email, OR:
wrangler d1 execute shiptrack --remote \
  --command "UPDATE watches SET status='cancelled' WHERE id='<watch-id>'"
```

### Setup

```bash
# 1. Create the D1 database
npx wrangler d1 create shiptrack
# Copy the `database_id` into BOTH wrangler.jsonc and wrangler.poller.jsonc

# 2. Apply schema (local + remote)
npm run db:migrate
npm run db:migrate:remote

# 3. Set secrets on the web worker
for k in ADMIN_TOKEN TOKEN_SECRET RESEND_API_KEY RESEND_FROM APP_URL; do
  npx wrangler secret put "$k"
done

# 4. Set the relevant secrets on the poller (no ADMIN_TOKEN needed there)
for k in TOKEN_SECRET RESEND_API_KEY RESEND_FROM APP_URL; do
  npx wrangler secret put "$k" -c wrangler.poller.jsonc
done

# 5. Deploy both
npm run deploy
```

`ADMIN_TOKEN` and `TOKEN_SECRET` should each be a random 32-byte hex string (`openssl rand -hex 32`). `RESEND_FROM` must be a verified sender in your Resend account.

## Deploy to Cloudflare Workers

This repo is configured for [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm install
npx wrangler login
npm run deploy
```

Local Workers preview (runs the actual worker bundle):

```bash
npm run preview
```

### CI deploys (Cloudflare Workers Builds)

Both workers are also built by Cloudflare Workers Builds on every push. Each
worker has its own build configuration, and **the deploy is the trigger's job,
not the build command's**:

| worker | build command | deploy command (`main`) | version command (other branches) |
| --- | --- | --- | --- |
| `shiptrack` (web) | `npm run deploy:web` | `npx wrangler deploy` | `npx wrangler versions upload` |
| `shiptrack-poller` | `npm install` | `npm run deploy:poller` | `npx wrangler versions upload` |

`deploy:web` therefore only *builds* — despite the name, which is fixed by the
existing trigger config. Do not make it deploy: it runs on every branch, so it
would ship unreviewed branch code straight to production. `npm run deploy` is
the manual full deploy (web + poller).

**Every wrangler invocation in these fields must go through `npm` or `npx`.**
Wrangler is a devDependency, and Cloudflare runs these commands with `/bin/sh`,
which does not have `node_modules/.bin` on `PATH` — a bare `wrangler deploy`
fails with `/bin/sh: 1: wrangler: not found`.

**The poller's command must also keep `-c wrangler.poller.jsonc`**, which is why
its row says `npm run deploy:poller` rather than the web worker's
`npx wrangler deploy`. Without the flag wrangler falls back to the default
`wrangler.jsonc`, whose `main` is the web app's `.open-next/worker.js`, and the
poller build — whose build command is only `npm install` — never produces that
bundle:

```
✘ [ERROR] The entry-point file at ".open-next/worker.js" was not found.
```

Copying the web row into the poller's config gets you exactly that error.

That failure mode is quiet and expensive. The version command still succeeds, so
versions keep accumulating in the dashboard while the *active* deployment stays
frozen at whatever last promoted successfully. The poller ran a bundle that was
a week stale this way: newly registered carriers were live on the site but
unknown to the poller, which then silently stamped `last_polled_at` and left
`last_known_status` null, so watches sat on "awaiting first scan" and never
alerted. To check what is actually serving traffic, rather than merely uploaded:

```bash
npx wrangler deployments status -c wrangler.poller.jsonc
```

`Source: deployment` with a recent timestamp is a real deploy; `version_upload`
next to a stale active version means the deploy step is failing.

## License

MIT — see [LICENSE](LICENSE).
