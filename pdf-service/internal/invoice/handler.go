package invoice

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/events"
)

const messageTimeout = 45 * time.Second

type Store interface {
	Exists(ctx context.Context, key string) (bool, error)
	PutPDF(ctx context.Context, key string, body []byte) error
}

type Publisher interface {
	Publish(ctx context.Context, body []byte) error
}

type Renderer func(order events.OrderCreatedData) ([]byte, error)

type Handler struct {
	log       *slog.Logger
	store     Store
	publisher Publisher
	render    Renderer
	prefix    string
	now       func() time.Time
}

func NewHandler(log *slog.Logger, store Store, publisher Publisher, render Renderer, prefix string) *Handler {
	return &Handler{log: log, store: store, publisher: publisher, render: render, prefix: prefix, now: time.Now}
}

func (h *Handler) Handle(ctx context.Context, body []byte) error {
	ctx, cancel := context.WithTimeout(ctx, messageTimeout)
	defer cancel()

	order, err := events.DecodeOrderCreated(body)
	if err != nil {
		return err
	}
	key := h.prefix + order.OrderID + ".pdf"

	exists, err := h.store.Exists(ctx, key)
	if err != nil {
		return fmt.Errorf("check invoice %s: %w", key, err)
	}
	if exists {
		h.log.Info("invoice already exists; re-publishing", "order_id", order.OrderID, "invoice_key", key)
	} else {
		doc, err := h.render(order)
		if err != nil {
			return err
		}
		if err := h.store.PutPDF(ctx, key, doc); err != nil {
			return fmt.Errorf("upload invoice %s: %w", key, err)
		}
		h.log.Info("invoice stored", "order_id", order.OrderID, "invoice_key", key, "bytes", len(doc))
	}

	event, err := events.EncodeInvoiceReady(events.InvoiceReadyData{
		OrderID:    order.OrderID,
		UserEmail:  order.UserEmail,
		InvoiceKey: key,
	}, h.now())
	if err != nil {
		return err
	}
	if err := h.publisher.Publish(ctx, event); err != nil {
		return fmt.Errorf("publish %s for order %s: %w", events.InvoiceReady, order.OrderID, err)
	}
	h.log.Info("invoice ready published", "order_id", order.OrderID)
	return nil
}
