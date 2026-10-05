package invoice

import (
	"context"
	"log/slog"

	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/events"
)

type Handler struct {
	log *slog.Logger
}

func NewHandler(log *slog.Logger) *Handler {
	return &Handler{log: log}
}

func (h *Handler) Handle(_ context.Context, body []byte) error {
	order, err := events.DecodeOrderCreated(body)
	if err != nil {
		return err
	}
	h.log.Info("order received", "order_id", order.OrderID, "items", len(order.Items), "total_cents", order.TotalCents)
	return nil
}
