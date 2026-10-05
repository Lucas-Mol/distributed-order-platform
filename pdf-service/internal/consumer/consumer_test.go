package consumer

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeQueue struct {
	mu      sync.Mutex
	batches [][]Message
	deleted []string
}

func (q *fakeQueue) Receive(ctx context.Context) ([]Message, error) {
	q.mu.Lock()
	if len(q.batches) > 0 {
		batch := q.batches[0]
		q.batches = q.batches[1:]
		q.mu.Unlock()
		return batch, nil
	}
	q.mu.Unlock()
	<-ctx.Done()
	return nil, ctx.Err()
}

func (q *fakeQueue) Delete(_ context.Context, receiptHandle string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.deleted = append(q.deleted, receiptHandle)
	return nil
}

type handlerFunc func(ctx context.Context, body []byte) error

func (f handlerFunc) Handle(ctx context.Context, body []byte) error { return f(ctx, body) }

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func messages(n int) []Message {
	out := make([]Message, n)
	for i := range out {
		id := strconv.Itoa(i)
		out[i] = Message{ID: id, ReceiptHandle: "rh-" + id, Body: id}
	}
	return out
}

func TestDeletesOnlySuccessfulMessages(t *testing.T) {
	queue := &fakeQueue{batches: [][]Message{messages(4)}}
	var handled atomic.Int32
	handler := handlerFunc(func(_ context.Context, body []byte) error {
		handled.Add(1)
		if string(body) == "2" {
			return errors.New("boom")
		}
		return nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		New(queue, handler, 2, discardLogger()).Run(ctx)
		close(done)
	}()
	waitFor(t, func() bool { return handled.Load() == 4 })
	cancel()
	<-done

	queue.mu.Lock()
	defer queue.mu.Unlock()
	if len(queue.deleted) != 3 {
		t.Fatalf("deleted %v, want every message except rh-2", queue.deleted)
	}
	for _, rh := range queue.deleted {
		if rh == "rh-2" {
			t.Fatalf("failed message was deleted")
		}
	}
}

func TestBoundsConcurrencyAndFinishesInFlightWork(t *testing.T) {
	const workers = 3
	queue := &fakeQueue{batches: [][]Message{messages(workers)}}
	var running, peak, finished atomic.Int32
	release := make(chan struct{})
	handler := handlerFunc(func(ctx context.Context, _ []byte) error {
		now := running.Add(1)
		for {
			old := peak.Load()
			if now <= old || peak.CompareAndSwap(old, now) {
				break
			}
		}
		<-release
		if ctx.Err() != nil {
			t.Error("handler context was cancelled by shutdown")
		}
		running.Add(-1)
		finished.Add(1)
		return nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		New(queue, handler, workers, discardLogger()).Run(ctx)
		close(done)
	}()
	waitFor(t, func() bool { return running.Load() == workers })

	cancel()
	select {
	case <-done:
		t.Fatal("Run returned before in-flight messages finished")
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	<-done

	if peak.Load() > workers {
		t.Fatalf("peak concurrency %d exceeds %d workers", peak.Load(), workers)
	}
	if finished.Load() != workers {
		t.Fatalf("finished %d messages, want %d", finished.Load(), workers)
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
