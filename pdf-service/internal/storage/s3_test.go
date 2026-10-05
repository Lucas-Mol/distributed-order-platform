package storage

import (
	"context"
	"errors"
	"io"
	"net/http"
	"testing"

	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

type fakeS3 struct {
	headErr error
	put     *s3.PutObjectInput
	body    []byte
}

func (f *fakeS3) HeadBucket(context.Context, *s3.HeadBucketInput, ...func(*s3.Options)) (*s3.HeadBucketOutput, error) {
	return &s3.HeadBucketOutput{}, nil
}

func (f *fakeS3) HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	return &s3.HeadObjectOutput{}, f.headErr
}

func (f *fakeS3) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	f.put = in
	body, err := io.ReadAll(in.Body)
	f.body = body
	return &s3.PutObjectOutput{}, err
}

func responseError(status int) error {
	return &awshttp.ResponseError{ResponseError: &smithyhttp.ResponseError{
		Response: &smithyhttp.Response{Response: &http.Response{StatusCode: status}},
		Err:      errors.New("http error"),
	}}
}

func TestExists(t *testing.T) {
	tests := []struct {
		name    string
		headErr error
		want    bool
		wantErr bool
	}{
		{"found", nil, true, false},
		{"typed not found", &types.NotFound{}, false, false},
		{"bare 404", responseError(http.StatusNotFound), false, false},
		{"forbidden", responseError(http.StatusForbidden), false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, err := NewS3Store(context.Background(), &fakeS3{headErr: tt.headErr}, "bucket")
			if err != nil {
				t.Fatalf("NewS3Store: %v", err)
			}
			got, err := store.Exists(context.Background(), "invoices/x.pdf")
			if got != tt.want || (err != nil) != tt.wantErr {
				t.Fatalf("Exists = %v, %v; want %v, error %v", got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestPutPDF(t *testing.T) {
	client := &fakeS3{}
	store, err := NewS3Store(context.Background(), client, "bucket")
	if err != nil {
		t.Fatalf("NewS3Store: %v", err)
	}
	if err := store.PutPDF(context.Background(), "invoices/x.pdf", []byte("%PDF-1.3")); err != nil {
		t.Fatalf("PutPDF: %v", err)
	}
	if *client.put.Bucket != "bucket" || *client.put.Key != "invoices/x.pdf" || *client.put.ContentType != "application/pdf" ||
		*client.put.ContentLength != 8 || string(client.body) != "%PDF-1.3" {
		t.Fatalf("unexpected PutObject input: %+v", client.put)
	}
}
