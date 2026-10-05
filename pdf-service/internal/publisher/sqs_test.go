package publisher

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

type fakeSQS struct {
	url  string
	sent *sqs.SendMessageInput
}

func (f *fakeSQS) GetQueueUrl(context.Context, *sqs.GetQueueUrlInput, ...func(*sqs.Options)) (*sqs.GetQueueUrlOutput, error) {
	return &sqs.GetQueueUrlOutput{QueueUrl: aws.String(f.url)}, nil
}

func (f *fakeSQS) SendMessage(_ context.Context, in *sqs.SendMessageInput, _ ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	f.sent = in
	return &sqs.SendMessageOutput{}, nil
}

func TestPublish(t *testing.T) {
	client := &fakeSQS{url: "http://sqs/invoice-ready-queue"}
	p, err := NewSQSPublisher(context.Background(), client, "invoice-ready-queue")
	if err != nil {
		t.Fatalf("NewSQSPublisher: %v", err)
	}
	if err := p.Publish(context.Background(), []byte(`{"event":"invoice.ready"}`)); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if *client.sent.QueueUrl != client.url || *client.sent.MessageBody != `{"event":"invoice.ready"}` {
		t.Fatalf("unexpected SendMessage input: %+v", client.sent)
	}
}

func TestNewSQSPublisherRejectsEmptyURL(t *testing.T) {
	if _, err := NewSQSPublisher(context.Background(), &fakeSQS{}, "missing"); err == nil {
		t.Fatal("expected an error for an empty queue URL")
	}
}
