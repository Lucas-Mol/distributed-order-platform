package events

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

const validOrderCreated = `{
  "event": "order.created",
  "version": 1,
  "occurred_at": "2026-01-15T12:00:00Z",
  "data": {
    "order_id": "8f1c0000-0000-4000-8000-000000000001",
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
	if data.OrderID != "8f1c0000-0000-4000-8000-000000000001" || data.TotalCents != 12990 || len(data.Items) != 1 || data.Items[0].Name != "T-shirt" {
		t.Fatalf("unexpected data: %+v", data)
	}
	if !data.OccurredAt.Equal(time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("unexpected occurred_at: %v", data.OccurredAt)
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
		{"missing order id", strings.Replace(validOrderCreated, `"order_id": "8f1c0000-0000-4000-8000-000000000001"`, `"order_id": ""`, 1), "missing order_id"},
		{"non-UUID order id", strings.Replace(validOrderCreated, `"order_id": "8f1c0000-0000-4000-8000-000000000001"`, `"order_id": "../secret"`, 1), "not a lowercase UUID"},
		{"missing occurred_at", strings.Replace(validOrderCreated, `"occurred_at": "2026-01-15T12:00:00Z",`, "", 1), "missing occurred_at"},
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

func TestEncodeInvoiceReady(t *testing.T) {
	body, err := EncodeInvoiceReady(InvoiceReadyData{
		OrderID:    "8f1c0000-0000-4000-8000-000000000001",
		UserEmail:  "customer@example.com",
		InvoiceKey: "invoices/8f1c0000-0000-4000-8000-000000000001.pdf",
	}, time.Date(2026, 1, 15, 9, 0, 3, 0, time.FixedZone("BRT", -3*3600)))
	if err != nil {
		t.Fatalf("EncodeInvoiceReady: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got["event"] != "invoice.ready" || got["version"] != float64(1) || got["occurred_at"] != "2026-01-15T12:00:03Z" {
		t.Fatalf("unexpected envelope: %s", body)
	}
	data, _ := got["data"].(map[string]any)
	if data["invoice_key"] != "invoices/8f1c0000-0000-4000-8000-000000000001.pdf" || data["user_email"] != "customer@example.com" {
		t.Fatalf("unexpected data: %s", body)
	}
}
