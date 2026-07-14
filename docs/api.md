# API Reference

All responses are JSON unless a deliverable is returned. Amounts in request and
response objects are integer USDC cents.

## Invoices

### List invoices

```http
GET /api/invoices
```

Returns `200` with `{ "invoices": [...] }`.

### Create an invoice

```http
POST /api/invoices
Content-Type: application/json
```

```json
{
  "title": "Brand launch",
  "clientName": "Nia Coffee",
  "clientEmail": "hello@nia.example",
  "freelancerName": "Amina Studio",
  "freelancerWallet": "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
  "note": "Final files release after settlement.",
  "convertPercent": 0,
  "milestones": [
    {
      "title": "Creative direction",
      "description": "Moodboard and visual routes.",
      "amountCents": 15000,
      "dueDate": "2026-07-20",
      "deliverableName": "creative-direction.pdf"
    }
  ]
}
```

Returns `201` with `{ "invoice": {...} }`. Invalid input returns `400` with
Zod issue details.

### Get an invoice

```http
GET /api/invoices/:invoiceId
```

Returns `200` with `{ "invoice": {...} }` or `404`.

## Milestone deliverables

### Attach a file

```http
POST /api/invoices/:invoiceId/milestones/:milestoneId/deliverable
Content-Type: multipart/form-data
```

The multipart field must be named `file`. Files are limited to 10 MB. The route
returns `201`, `404` for an unknown milestone, `409` after settlement, or `413`
when the file is too large.

### Download a released file

```http
GET /api/invoices/:invoiceId/milestones/:milestoneId/deliverable
```

Returns the attachment after release. A locked file returns `403`; a milestone
without an uploaded file returns `404`.

## Confirm a browser payment

```http
POST /api/invoices/:invoiceId/milestones/:milestoneId/confirm
Content-Type: application/json
```

```json
{
  "transactionHash": "0x..."
}
```

The server verifies the transaction against Celo before changing invoice state.
It returns `200` with the updated invoice, `422` for a receipt mismatch, or `409`
when a transaction hash has already been used.

Development accepts references prefixed with `demo_` so the interface can be
shown without a funded wallet. Production rejects these references.

## Purchase a file with x402

```http
GET /api/x402/invoices/:invoiceId/milestones/:milestoneId/deliverable
```

Without payment, a configured facilitator returns an x402 `402` challenge for
the exact milestone price. A successful settlement returns the file and records
the facilitator receipt.

The route returns `503` when server-side x402 credentials are absent and `409`
when the milestone has already settled through another flow.
