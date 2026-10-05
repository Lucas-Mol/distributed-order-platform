package config

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

const (
	defaultPort          = 8080
	maxWorkerConcurrency = 64
)

type Config struct {
	Env               string
	Port              int
	Bucket            string
	InvoicePrefix     string
	OrdersQueue       string
	InvoiceReadyQueue string
	WorkerConcurrency int
}

func Load(ctx context.Context, getenv func(string) string, client ssm.GetParametersByPathAPIClient) (Config, error) {
	env := strings.TrimSpace(getenv("APP_ENV"))
	if env == "" {
		return Config{}, errors.New("missing required environment variable APP_ENV")
	}
	if strings.TrimSpace(getenv("AWS_REGION")) == "" {
		return Config{}, errors.New("missing required environment variable AWS_REGION")
	}
	port, err := parsePort(getenv("PORT"))
	if err != nil {
		return Config{}, err
	}

	prefix := "/order-platform/" + env
	shared, err := loadParameters(ctx, client, prefix+"/shared")
	if err != nil {
		return Config{}, err
	}
	service, err := loadParameters(ctx, client, prefix+"/pdf-service")
	if err != nil {
		return Config{}, err
	}

	var missing []string
	param := func(values map[string]string, scope, key string) string {
		value := strings.TrimSpace(values[key])
		if value == "" {
			missing = append(missing, fmt.Sprintf("%s/%s/%s", prefix, scope, key))
		}
		return value
	}

	cfg := Config{
		Env:               env,
		Port:              port,
		Bucket:            param(shared, "shared", "s3-bucket"),
		InvoicePrefix:     param(shared, "shared", "s3-invoice-prefix"),
		OrdersQueue:       param(shared, "shared", "sqs-orders-queue"),
		InvoiceReadyQueue: param(shared, "shared", "sqs-invoice-ready-queue"),
	}
	concurrency := param(service, "pdf-service", "worker-concurrency")
	if len(missing) > 0 {
		sort.Strings(missing)
		return Config{}, fmt.Errorf("missing SSM parameters: %s", strings.Join(missing, ", "))
	}

	cfg.WorkerConcurrency, err = strconv.Atoi(concurrency)
	if err != nil || cfg.WorkerConcurrency < 1 || cfg.WorkerConcurrency > maxWorkerConcurrency {
		return Config{}, fmt.Errorf("%s/pdf-service/worker-concurrency must be an integer between 1 and %d", prefix, maxWorkerConcurrency)
	}
	if !strings.HasSuffix(cfg.InvoicePrefix, "/") {
		return Config{}, fmt.Errorf("%s/shared/s3-invoice-prefix must end with \"/\"", prefix)
	}
	return cfg, nil
}

func parsePort(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultPort, nil
	}
	port, err := strconv.Atoi(raw)
	if err != nil || port < 1 || port > 65535 {
		return 0, errors.New("PORT must be an integer between 1 and 65535")
	}
	return port, nil
}

func loadParameters(ctx context.Context, client ssm.GetParametersByPathAPIClient, path string) (map[string]string, error) {
	values := map[string]string{}
	recursive := true
	paginator := ssm.NewGetParametersByPathPaginator(client, &ssm.GetParametersByPathInput{
		Path:      &path,
		Recursive: &recursive,
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("read SSM parameters under %s: %w", path, err)
		}
		for _, param := range page.Parameters {
			if param.Name == nil || param.Value == nil {
				continue
			}
			values[strings.TrimPrefix(*param.Name, path+"/")] = *param.Value
		}
	}
	return values, nil
}
