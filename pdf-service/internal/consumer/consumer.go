package consumer

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

const (
	initialBackoff = time.Second
	maxBackoff     = 30 * time.Second
)

type Message struct {
	ID            string
	ReceiptHandle string
	Body          string
}

type Queue interface {
	Receive(ctx context.Context) ([]Message, error)
	Delete(ctx context.Context, receiptHandle string) error
}

type Handler interface {
	Handle(ctx context.Context, body []byte) error
}

type Consumer struct {
	queue   Queue
	handler Handler
	workers int
	log     *slog.Logger
}

func New(queue Queue, handler Handler, workers int, log *slog.Logger) *Consumer {
	return &Consumer{queue: queue, handler: handler, workers: workers, log: log}
}

func (c *Consumer) Run(ctx context.Context) {
	jobs := make(chan Message)
	var wg sync.WaitGroup
	for range c.workers {
		wg.Go(func() {
			for msg := range jobs {
				c.process(context.WithoutCancel(ctx), msg)
			}
		})
	}

	backoff := initialBackoff
poll:
	for ctx.Err() == nil {
		messages, err := c.queue.Receive(ctx)
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			c.log.Error("receive failed", "error", err, "retry_in", backoff)
			if !sleep(ctx, backoff) {
				break
			}
			backoff = min(backoff*2, maxBackoff)
			continue
		}
		backoff = initialBackoff
		for _, msg := range messages {
			select {
			case jobs <- msg:
			case <-ctx.Done():
				break poll
			}
		}
	}

	close(jobs)
	wg.Wait()
}

func (c *Consumer) process(ctx context.Context, msg Message) {
	if err := c.handler.Handle(ctx, []byte(msg.Body)); err != nil {
		c.log.Error("message failed; it will be retried", "message_id", msg.ID, "error", err)
		return
	}
	if err := c.queue.Delete(ctx, msg.ReceiptHandle); err != nil {
		c.log.Error("delete failed; the message will be redelivered", "message_id", msg.ID, "error", err)
	}
}

func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}
