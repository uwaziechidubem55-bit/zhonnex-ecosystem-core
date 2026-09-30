===========================================================================
FILE: commerce-finance/product-vault/PAYMENTS.md
===========================================================================
# Step 2 — vault payment foundation

This is a server-only module, not a running checkout endpoint or a live product. `payments.ts` creates Paystack checkout intents, verifies signed webhooks against the raw request body, re-verifies successful charges with Paystack, and records buyer/product entitlements. Stripe deliberately refuses checkout until an approved account and separate integration are provided. Archaios records do not prove bank settlement.

Required server-only variables (never commit values): `PAYSTACK_SECRET_KEY`, `ZHONNEX_ORDERS_PATH` (absolute private file path), and `ZHONNEX_VAULT_PRODUCTS_JSON`, for example `[ {"id":"demo","name":"Example product","amount":150050,"currency":"NGN","storagePath":"private/demo.bin"} ]`. The amount is in **kobo**. This example is documentation only; it is not enabled by default. Use Paystack test credentials first. Set products and prices yourself before any live charge.

Your HTTP integration must authenticate the buyer before invoking `startPaystackCheckout`, serve the returned `authorizationUrl` as a redirect, read the **raw** webhook bytes without JSON middleware alteration, pass the `x-paystack-signature` header to `processPaystackWebhook`, and acknowledge delivery without giving access based on the redirect. Before downloading, authenticate the buyer and check `hasPaidEntitlement`. Keep binaries outside the public web directory. Handle chargebacks/refunds and revoke entitlements as required before production. Do not deploy the file store on multiple workers/serverless: replace with a transactional database with unique order/reference indexes first.

## First proposed product (not live)

**LaunchSprint — The 30-Day Business Starter Kit** is the actual offline HTML file at `private/launch-sprint.html`. Suggested introductory price: **₦4,900** (Paystack amount `490000` kobo). This is a proposed price, not evidence of demand or a charge already enabled. Test with customers before promising results. To configure after reviewing the file, use a private server environment value for `ZHONNEX_VAULT_PRODUCTS_JSON`:

```json
[{"id":"launchsprint-v1","name":"LaunchSprint — The 30-Day Business Starter Kit","amount":490000,"currency":"NGN","storagePath":"private/launch-sprint.html"}]
```

Do not put this file in a public web directory or expose its path in a public endpoint. No real checkout is active until authenticated HTTP routes, webhook handling, private download delivery, and secret configuration are deployed.

## Version updates and subscription catalog (prototype, not live billing)

`subscriptions.ts` defines Starter/Growth/Team with monthly and yearly NGN prices and feature flags. `subscriptions.test.ts` tests tier gates and human-reviewed ideas. Prices are proposals in code, **not Paystack subscription plans**. The existing `payments.ts` is for one-time checkout only: do not use it to claim a recurring subscription is active. Before selling subscriptions: create the six corresponding Paystack plans in the merchant dashboard; map their server-side plan codes to these immutable IDs; implement authenticated subscriber accounts, recurring checkout and webhooks for renewal, failure, cancellation, refund, and chargeback; validate provider events and active access server-side; use a transactional database. Never rely on client-side feature flags for paid access. Do not change an existing subscriber's charge automatically when prices change.

`release-manifest.json` is a sample public release notice; **not** a paid download link. To activate optional updates, host a reviewed manifest at an HTTPS URL and set `RELEASE_MANIFEST_URL` in the offline HTML to that URL before shipping a new version. A user must press **Check for updates**; the request does not send their plan. The file still works without the network. Publish only tested releases with human approval. `suggestIdeas()` derives candidate ideas from feedback you explicitly feed it; it does not browse the web, run AI autonomously, deploy code or change prices.
