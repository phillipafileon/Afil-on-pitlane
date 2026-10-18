# Staging read-only service catalogue contract (18 October 2026)

Compiled from `live-services/server_v3.js` after applying all Docker `RUN node *.cjs` patches in order, with *no server boot* and no runtime credentials. Workflow: [compiled contract check](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39139635018). The corresponding non-secret machine-readable source is `compiled-public-service-snapshot.json`.

**Note:** This snapshot uses `E46_BOOKING_LIVE=false` intentionally because the environment-specific Render flag has not been verified. The Cloudflare staging worker ALWAYS keeps E46 booking disabled even if a price override exists. This is not a definitive statement about its current live availability.

- Services: four IDs (`pre_track_inspection`, `vehicle_hire_day`, `track_day_support`, `vehicle_transport`). The original standalone `race_day_support` and `full_package` services were removed by the final consolidation patch.
- Next-day **payment** and **checkout-start** cutoffs in final compiled code: E46 **11:30**, pre-track inspection **22:00**, default **20:00** (UK time). Intermediate patches mentioned older 10:59/23:29/19:29 start times, but a later correction patch updated the final values. Live policy parity still needs full end-to-end verification.
- Available inspection appointment slots: 10:00, 12:00, 14:00, 16:00, 18:00.
- Compiled standard venues: Brands Hatch and Lydden Hill; compiled operations base: Gravesend. These are current *code values*, not a claim about present operating address.
- Baseline prices: pre-track inspection 12000p; E46 70000p; track-day/race-day support 30000p half-day or 50000p full-day; vehicle transport is quote-only. Travel rate 35p/mile inspection; 55p/mile E46, support, and vehicle transport. All baseline values may be overridden in the source operational database.
- Current staged `GET /api/services` implementation applies D1 price/travel overrides on each request, returns `{services,venues,operations_base}`, and keeps bookings and payments disabled. It is prepared in GitHub but must be manually deployed to the isolated Worker and live-smoke-tested.
- `GET /api/config` is **NOT** ported yet: it additionally depends on compiled contract terms versions, signed security authorisation amount, launch switches, Printful flags, venue travel calculations and other runtime configuration. Returning fabricated values would mislead customers; it currently remains fail-closed.

Do not update customer website/app API URLs or Stripe webhooks. Keep Render and Neon active pending payment and admin parity.
