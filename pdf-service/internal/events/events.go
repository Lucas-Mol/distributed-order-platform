package events

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const OrderCreated = "order.created"

type Envelope struct {
	Event      string          `json:"event"`
	Version    int             `json:"version"`
	OccurredAt time.Time       `json:"occurred_at"`
	Data       json.RawMessage `json:"data"`
}

type OrderItem struct {
	ProductID      string `json:"product_id"`
	Name           string `json:"name"`
	Quantity       int    `json:"quantity"`
	UnitPriceCents int64  `json:"unit_price_cents"`
}

type OrderCreatedData struct {
	OrderID    string      `json:"order_id"`
	UserID     string      `json:"user_id"`
	UserEmail  string      `json:"user_email"`
	TotalCents int64       `json:"total_cents"`
	Items      []OrderItem `json:"items"`
}

func DecodeOrderCreated(body []byte) (OrderCreatedData, error) {
	var envelope Envelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return OrderCreatedData{}, fmt.Errorf("decode envelope: %w", err)
	}
	if envelope.Event != OrderCreated || envelope.Version != 1 {
		return OrderCreatedData{}, fmt.Errorf("unsupported event %q v%d", envelope.Event, envelope.Version)
	}

	var data OrderCreatedData
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		return OrderCreatedData{}, fmt.Errorf("decode %s data: %w", OrderCreated, err)
	}
	if data.OrderID == "" || data.UserID == "" || data.UserEmail == "" {
		return OrderCreatedData{}, errors.New("order.created is missing order_id, user_id or user_email")
	}
	if len(data.Items) == 0 {
		return OrderCreatedData{}, fmt.Errorf("order %s has no items", data.OrderID)
	}
	var total int64
	for _, item := range data.Items {
		if item.ProductID == "" || item.Quantity <= 0 || item.UnitPriceCents < 0 {
			return OrderCreatedData{}, fmt.Errorf("order %s has an invalid item", data.OrderID)
		}
		total += int64(item.Quantity) * item.UnitPriceCents
	}
	if total != data.TotalCents {
		return OrderCreatedData{}, fmt.Errorf("order %s total %d does not match its items (%d)", data.OrderID, data.TotalCents, total)
	}
	return data, nil
}
