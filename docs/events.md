# Event contract

Every queue payload is UTF-8 JSON with the envelope fields below. A format change requires a new `version` and a period during which consumers accept both.

## Envelope

| Field | Type | Description |
|---|---|---|
| `event` | string | Event name (e.g. `order.created`) |
| `version` | int | Payload version. Starts at `1` |
| `occurred_at` | string | ISO-8601 in UTC |
| `data` | object | Event-specific body |

---

## `order.created` — v1

Published by the **backend (NestJS)** to `orders-queue` after the order creation transaction commits.
Consumed by the **pdf-service (Go)**.

```json
{
  "event": "order.created",
  "version": 1,
  "occurred_at": "2026-01-15T12:00:00Z",
  "data": {
    "order_id": "8f1c...",
    "user_id": "2a9b...",
    "user_email": "customer@example.com",
    "total_cents": 12990,
    "items": [
      { "product_id": "d3e1...", "name": "T-shirt", "quantity": 2, "unit_price_cents": 6495 }
    ]
  }
}
```

The consumer is **idempotent by `order_id`**: if the invoice already exists in S3, the event is re-emitted and the message deleted without regenerating the PDF.

---

## `invoice.ready` — v1

Published by the **pdf-service (Go)** to `invoice-ready-queue` after writing the PDF to S3.
Consumed by the **`notify-order` Lambda (Python)**.

```json
{
  "event": "invoice.ready",
  "version": 1,
  "occurred_at": "2026-01-15T12:00:03Z",
  "data": {
    "order_id": "8f1c...",
    "user_email": "customer@example.com",
    "invoice_key": "invoices/8f1c....pdf"
  }
}
```

The Lambda updates `orders.status` to `READY` and stores `invoice_key` only if the current status is `CREATED` or `PROCESSING`, so reprocessing never downgrades an order that is already `DELIVERED`. It rejects an `order_id` that is not a UUID and an `invoice_key` other than `{invoice prefix}{order_id}.pdf`.

---

## SNS notification (`order-notifications`)

Published by the `notify-order` Lambda in the same database transaction that sets `READY`: if publishing fails, the status change rolls back and the message is retried. A redelivery for an order that is already `READY` does not publish again. Not consumed by any of our services; it exists for e-mail/push.

```json
{
  "order_id": "8f1c...",
  "status": "READY",
  "invoice_key": "invoices/8f1c....pdf"
}
```

---

## Failure handling

Each queue has a DLQ with `maxReceiveCount = 3` and a 60s `VisibilityTimeout`. The consumer only deletes the message after the side effect is confirmed (PDF in S3 / status written to Postgres). A message that lands in the DLQ is investigated manually — there is no automatic reprocessing in the MVP.
