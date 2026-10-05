package publisher

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

type SQSAPI interface {
	GetQueueUrl(ctx context.Context, in *sqs.GetQueueUrlInput, opts ...func(*sqs.Options)) (*sqs.GetQueueUrlOutput, error)
	SendMessage(ctx context.Context, in *sqs.SendMessageInput, opts ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
}

type SQSPublisher struct {
	client SQSAPI
	url    string
}

func NewSQSPublisher(ctx context.Context, client SQSAPI, name string) (*SQSPublisher, error) {
	out, err := client.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(name)})
	if err != nil {
		return nil, fmt.Errorf("resolve SQS queue %s: %w", name, err)
	}
	if aws.ToString(out.QueueUrl) == "" {
		return nil, fmt.Errorf("resolve SQS queue %s: queue URL is empty", name)
	}
	return &SQSPublisher{client: client, url: *out.QueueUrl}, nil
}

func (p *SQSPublisher) Publish(ctx context.Context, body []byte) error {
	_, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:    &p.url,
		MessageBody: aws.String(string(body)),
	})
	return err
}
