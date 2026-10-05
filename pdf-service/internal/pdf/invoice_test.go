package pdf

import (
	"bytes"
	"fmt"
	"testing"
	"time"

	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/events"
)

func order(items int) events.OrderCreatedData {
	data := events.OrderCreatedData{
		OccurredAt: time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC),
		OrderID:    "8f1c0000-0000-4000-8000-000000000001",
		UserID:     "2a9b0000-0000-4000-8000-000000000002",
		UserEmail:  "customer@example.com",
	}
	for i := range items {
		item := events.OrderItem{
			ProductID:      fmt.Sprintf("d3e1-%d", i),
			Name:           fmt.Sprintf("Camiseta básica %d with a fairly long name that has to wrap inside its column", i),
			Quantity:       i + 1,
			UnitPriceCents: 6495,
		}
		data.Items = append(data.Items, item)
		data.TotalCents += int64(item.Quantity) * item.UnitPriceCents
	}
	return data
}

func TestRenderInvoice(t *testing.T) {
	for _, items := range []int{1, 120} {
		t.Run(fmt.Sprintf("%d items", items), func(t *testing.T) {
			doc, err := RenderInvoice(order(items))
			if err != nil {
				t.Fatalf("RenderInvoice: %v", err)
			}
			if !bytes.HasPrefix(doc, []byte("%PDF-")) {
				t.Fatalf("output is not a PDF: %q", doc[:min(len(doc), 16)])
			}
		})
	}
}

func TestFormatCents(t *testing.T) {
	tests := map[int64]string{
		0:          "$0.00",
		5:          "$0.05",
		6495:       "$64.95",
		123456:     "$1,234.56",
		1234567890: "$12,345,678.90",
		-150:       "-$1.50",
	}
	for cents, want := range tests {
		if got := FormatCents(cents); got != want {
			t.Errorf("FormatCents(%d) = %q, want %q", cents, got, want)
		}
	}
}
