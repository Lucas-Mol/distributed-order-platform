package invoice

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/events"
)

const (
	orderID    = "8f1c0000-0000-4000-8000-000000000001"
	invoiceKey = "invoices/" + orderID + ".pdf"
	orderEvent = `{
  "event": "order.created",
  "version": 1,
  "occurred_at": "2026-01-15T12:00:00Z",
  "data": {
    "order_id": "` + orderID + `",
    "user_id": "2a9b0000-0000-4000-8000-000000000002",
    "user_email": "customer@example.com",
    "total_cents": 12990,
    "items": [{"product_id": "d3e1", "name": "T-shirt", "quantity": 2, "unit_price_cents": 6495}]
  }
}`
)

type fakeStore struct {
	objects   map[string][]byte
	existsErr error
	putErr    error
	puts      int
}

func (s *fakeStore) Exists(_ context.Context, key string) (bool, error) {
	_, ok := s.objects[key]
	return ok, s.existsErr
}

func (s *fakeStore) PutPDF(_ context.Context, key string, body []byte) error {
	s.puts++
	if s.putErr != nil {
		return s.putErr
	}
	s.objects[key] = body
	return nil
}

type fakePublisher struct {
	sent [][]byte
	err  error
}

func (p *fakePublisher) Publish(_ context.Context, body []byte) error {
	if p.err != nil {
		return p.err
	}
	p.sent = append(p.sent, body)
	return nil
}

type fixture struct {
	handler   *Handler
	store     *fakeStore
	publisher *fakePublisher
	renders   int
}

func newFixture() *fixture {
	f := &fixture{store: &fakeStore{objects: map[string][]byte{}}, publisher: &fakePublisher{}}
	render := func(events.OrderCreatedData) ([]byte, error) {
		f.renders++
		return []byte("%PDF-1.3"), nil
	}
	f.handler = NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), f.store, f.publisher, render, "invoices/")
	f.handler.now = func() time.Time { return time.Date(2026, 1, 15, 12, 0, 3, 0, time.UTC) }
	return f
}

func assertInvoiceReady(t *testing.T, body []byte) {
	t.Helper()
	var envelope struct {
		Event string                  `json:"event"`
		Data  events.InvoiceReadyData `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("unmarshal invoice.ready: %v", err)
	}
	want := events.InvoiceReadyData{OrderID: orderID, UserEmail: "customer@example.com", InvoiceKey: invoiceKey}
	if envelope.Event != events.InvoiceReady || envelope.Data != want {
		t.Fatalf("unexpected invoice.ready: %s", body)
	}
}

func TestHandleStoresInvoiceAndPublishes(t *testing.T) {
	f := newFixture()
	if err := f.handler.Handle(context.Background(), []byte(orderEvent)); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if string(f.store.objects[invoiceKey]) != "%PDF-1.3" {
		t.Fatalf("invoice not stored at %s: %v", invoiceKey, f.store.objects)
	}
	if len(f.publisher.sent) != 1 {
		t.Fatalf("published %d events, want 1", len(f.publisher.sent))
	}
	assertInvoiceReady(t, f.publisher.sent[0])
}

func TestHandleExistingInvoiceOnlyRepublishes(t *testing.T) {
	f := newFixture()
	f.store.objects[invoiceKey] = []byte("%PDF-old")
	if err := f.handler.Handle(context.Background(), []byte(orderEvent)); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if f.renders != 0 || f.store.puts != 0 {
		t.Fatalf("regenerated an existing invoice (renders=%d, puts=%d)", f.renders, f.store.puts)
	}
	if string(f.store.objects[invoiceKey]) != "%PDF-old" || len(f.publisher.sent) != 1 {
		t.Fatalf("unexpected state: objects=%v sent=%d", f.store.objects, len(f.publisher.sent))
	}
	assertInvoiceReady(t, f.publisher.sent[0])
}

func TestHandlePublishFailureIsRetriedWithoutRegenerating(t *testing.T) {
	f := newFixture()
	f.publisher.err = errors.New("sqs down")
	err := f.handler.Handle(context.Background(), []byte(orderEvent))
	if err == nil || !strings.Contains(err.Error(), "publish invoice.ready") {
		t.Fatalf("got error %v, want a publish failure", err)
	}

	f.publisher.err = nil
	if err := f.handler.Handle(context.Background(), []byte(orderEvent)); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if f.renders != 1 || f.store.puts != 1 || len(f.publisher.sent) != 1 {
		t.Fatalf("renders=%d puts=%d sent=%d, want 1 each", f.renders, f.store.puts, len(f.publisher.sent))
	}
}

func TestHandleFailures(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		setup   func(*fixture)
		wantErr string
	}{
		{"invalid event", `{"event":"other","version":1}`, nil, "unsupported event"},
		{"exists check fails", orderEvent, func(f *fixture) { f.store.existsErr = errors.New("s3 down") }, "check invoice"},
		{"upload fails", orderEvent, func(f *fixture) { f.store.putErr = errors.New("s3 down") }, "upload invoice"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFixture()
			if tt.setup != nil {
				tt.setup(f)
			}
			err := f.handler.Handle(context.Background(), []byte(tt.body))
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("got error %v, want one containing %q", err, tt.wantErr)
			}
			if len(f.publisher.sent) != 0 {
				t.Fatal("published invoice.ready after a failure")
			}
		})
	}
}
