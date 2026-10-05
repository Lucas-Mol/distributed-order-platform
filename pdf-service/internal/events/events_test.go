package events

import (
	"strings"
	"testing"
)

const validOrderCreated = `{
  "event": "order.created",
  "version": 1,
  "occurred_at": "2026-01-15T12:00:00Z",
  "data": {
    "order_id": "8f1c",
    "user_id": "2a9b",
    "user_email": "customer@example.com",
    "total_cents": 12990,
    "items": [{"product_id": "d3e1", "name": "T-shirt", "quantity": 2, "unit_price_cents": 6495}]
  }
}`

func TestDecodeOrderCreated(t *testing.T) {
	data, err := DecodeOrderCreated([]byte(validOrderCreated))
	if err != nil {
		t.Fatalf("DecodeOrderCreated: %v", err)
	}
	if data.OrderID != "8f1c" || data.TotalCents != 12990 || len(data.Items) != 1 || data.Items[0].Name != "T-shirt" {
		t.Fatalf("unexpected data: %+v", data)
	}
}

func TestDecodeOrderCreatedRejects(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{"malformed JSON", `{"event":`, "decode envelope"},
		{"other event", strings.Replace(validOrderCreated, "order.created", "invoice.ready", 1), "unsupported event"},
		{"other version", strings.Replace(validOrderCreated, `"version": 1`, `"version": 2`, 1), "unsupported event"},
		{"missing order id", strings.Replace(validOrderCreated, `"order_id": "8f1c"`, `"order_id": ""`, 1), "missing order_id"},
		{"no items", strings.Replace(validOrderCreated, `"items": [{"product_id": "d3e1", "name": "T-shirt", "quantity": 2, "unit_price_cents": 6495}]`, `"items": []`, 1), "no items"},
		{"zero quantity", strings.Replace(validOrderCreated, `"quantity": 2`, `"quantity": 0`, 1), "invalid item"},
		{"wrong total", strings.Replace(validOrderCreated, `"total_cents": 12990`, `"total_cents": 1`, 1), "does not match"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := DecodeOrderCreated([]byte(tt.body))
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("got error %v, want one containing %q", err, tt.wantErr)
			}
		})
	}
}
