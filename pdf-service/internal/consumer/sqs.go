package consumer

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

const (
	maxBatch        = 10
	waitTimeSeconds = 20
)

var errNoQueueURL = errors.New("queue URL is empty")

type SQSAPI interface {
	GetQueueUrl(ctx context.Context, in *sqs.GetQueueUrlInput, opts ...func(*sqs.Options)) (*sqs.GetQueueUrlOutput, error)
	ReceiveMessage(ctx context.Context, in *sqs.ReceiveMessageInput, opts ...func(*sqs.Options)) (*sqs.ReceiveMessageOutput, error)
	DeleteMessage(ctx context.Context, in *sqs.DeleteMessageInput, opts ...func(*sqs.Options)) (*sqs.DeleteMessageOutput, error)
}

type SQSQueue struct {
	client      SQSAPI
	url         string
	maxMessages int32
}

func NewSQSQueue(ctx context.Context, client SQSAPI, name string, batch int) (*SQSQueue, error) {
	out, err := client.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(name)})
	if err != nil {
		return nil, fmt.Errorf("resolve SQS queue %s: %w", name, err)
	}
	if aws.ToString(out.QueueUrl) == "" {
		return nil, fmt.Errorf("resolve SQS queue %s: %w", name, errNoQueueURL)
	}
	return &SQSQueue{
		client:      client,
		url:         *out.QueueUrl,
		maxMessages: int32(min(max(batch, 1), maxBatch)),
	}, nil
}

func (q *SQSQueue) Receive(ctx context.Context) ([]Message, error) {
	out, err := q.client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
		QueueUrl:            &q.url,
		MaxNumberOfMessages: q.maxMessages,
		WaitTimeSeconds:     waitTimeSeconds,
	})
	if err != nil {
		return nil, err
	}
	messages := make([]Message, 0, len(out.Messages))
	for _, m := range out.Messages {
		messages = append(messages, Message{
			ID:            aws.ToString(m.MessageId),
			ReceiptHandle: aws.ToString(m.ReceiptHandle),
			Body:          aws.ToString(m.Body),
		})
	}
	return messages, nil
}

func (q *SQSQueue) Delete(ctx context.Context, receiptHandle string) error {
	_, err := q.client.DeleteMessage(ctx, &sqs.DeleteMessageInput{
		QueueUrl:      &q.url,
		ReceiptHandle: &receiptHandle,
	})
	return err
}
