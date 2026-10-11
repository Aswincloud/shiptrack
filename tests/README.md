# Parser tests

Carrier parsers are the most bug-prone part of ShipTrack — each scrapes or reads
a courier's undocumented page/feed, and a courier can change that shape without
notice. These tests freeze the behaviour against **saved fixtures** so a
regression shows up in CI instead of in a missed delivery alert.

## How they work

Every carrier's `track()` makes one or two `fetch()` calls. `stubFetch()` (in
`helpers.ts`) replaces `global.fetch` with a scripted list of responses — one
per call the carrier makes — each backed by a file in `fixtures/<carrier>/`. No
test ever touches a real courier, D1, or the Workers runtime.

This matters because **couriers delete delivered shipments after a few days**
(TPC drops them from its feed entirely). A live tracking number would make the
test pass today and fail — or 404 — next week. A fixture captured once never
changes.

## The fixtures

- `tests/fixtures/tpc/*.txt` — **real** captures of TPC's mobile feed
  (`in_transit`, `out_for_delivery`, `notfound`). `delivered.txt` is hand-built
  in the exact CRLF feed format, because TPC deletes delivered consignments
  before one can be captured.
- The rest are representative of each carrier's documented response shape (see
  the long comment at the top of each `src/carriers/*.ts`). When a real page is
  captured, drop it in and the test will pin to it.

To refresh a public one, e.g. TPC:

```sh
curl -s -A "Mozilla/5.0" \
  "https://www.tpcindia.com/TPCWebService/TrackMobDe.ashx?podno=<CONSIGNMENT>" \
  -o tests/fixtures/tpc/in_transit.txt
```

## Run

```sh
npm test          # once
npm run test:watch
```

## What they cover

For each carrier: a delivered/in-transit parse (scan order, status mapping,
locations, dates), the out-for-delivery-vs-delivered keyword trap, and the
carrier's own not-found and invalid-input signals. `normalize.test.ts` covers
the shared status carry-forward and HTML-entity decoding; `registry.test.ts`
covers carrier lookup and shape detection.

They do **not** check live courier reachability — that's not a fixture's job.
A courier redesign is caught the first time someone captures a fresh fixture;
until then these guard against *code* regressions.
