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
