package config

import (
	"context"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/aws/aws-sdk-go-v2/service/ssm/types"
)

type fakeSSM map[string]map[string]string

func (f fakeSSM) GetParametersByPath(_ context.Context, in *ssm.GetParametersByPathInput, _ ...func(*ssm.Options)) (*ssm.GetParametersByPathOutput, error) {
	out := &ssm.GetParametersByPathOutput{}
	for key, value := range f[*in.Path] {
		out.Parameters = append(out.Parameters, types.Parameter{
			Name:  aws.String(*in.Path + "/" + key),
			Value: aws.String(value),
		})
	}
	return out, nil
}

func validParams() fakeSSM {
	return fakeSSM{
		"/order-platform/local/shared": {
			"s3-bucket":               "orders-platform",
			"s3-invoice-prefix":       "invoices/",
			"sqs-orders-queue":        "orders-queue",
			"sqs-invoice-ready-queue": "invoice-ready-queue",
		},
		"/order-platform/local/pdf-service": {"worker-concurrency": "4"},
	}
}

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

var baseEnv = map[string]string{"APP_ENV": "local", "AWS_REGION": "us-east-1"}

func TestLoad(t *testing.T) {
	cfg, err := Load(context.Background(), env(baseEnv), validParams())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := Config{
		Env:               "local",
		Port:              8080,
		Bucket:            "orders-platform",
		InvoicePrefix:     "invoices/",
		OrdersQueue:       "orders-queue",
		InvoiceReadyQueue: "invoice-ready-queue",
		WorkerConcurrency: 4,
	}
	if cfg != want {
		t.Fatalf("got %+v, want %+v", cfg, want)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		mutate  func(fakeSSM)
		wantErr string
	}{
		{
			name:    "missing APP_ENV",
			env:     map[string]string{"AWS_REGION": "us-east-1"},
			wantErr: "APP_ENV",
		},
		{
			name:    "invalid PORT",
			env:     map[string]string{"APP_ENV": "local", "AWS_REGION": "us-east-1", "PORT": "http"},
			wantErr: "PORT",
		},
		{
			name: "missing parameters are all listed",
			mutate: func(p fakeSSM) {
				delete(p["/order-platform/local/shared"], "s3-bucket")
				delete(p["/order-platform/local/pdf-service"], "worker-concurrency")
			},
			wantErr: "/order-platform/local/pdf-service/worker-concurrency, /order-platform/local/shared/s3-bucket",
		},
		{
			name:    "concurrency out of range",
			mutate:  func(p fakeSSM) { p["/order-platform/local/pdf-service"]["worker-concurrency"] = "0" },
			wantErr: "worker-concurrency",
		},
		{
			name:    "invoice prefix without slash",
			mutate:  func(p fakeSSM) { p["/order-platform/local/shared"]["s3-invoice-prefix"] = "invoices" },
			wantErr: "s3-invoice-prefix",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := validParams()
			if tt.mutate != nil {
				tt.mutate(params)
			}
			values := tt.env
			if values == nil {
				values = baseEnv
			}
			_, err := Load(context.Background(), env(values), params)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("got error %v, want one containing %q", err, tt.wantErr)
			}
		})
	}
}
