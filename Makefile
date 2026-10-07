SHELL := /bin/bash
AWSLOCAL := aws --endpoint-url http://localhost:4566
GO_IMAGE := golang:1.27-alpine
PYTHON_IMAGE := python:3.12-slim
LAMBDAS := image_thumbnail notify_order
# Go runs in a container; module and build caches live in pdf-service/.cache.
GO := docker run --rm --user "$$(id -u):$$(id -g)" -e HOME=/tmp \
	-e GOMODCACHE=/src/.cache/mod -e GOCACHE=/src/.cache/build \
	-v "$(CURDIR)/pdf-service:/src" -w /src $(GO_IMAGE)

.PHONY: help up up-all down logs ps reset aws-resources lambdas lambda-test pdf-tidy pdf-test pdf-lint

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-14s %s\n", $$1, $$2}'

up: ## Start infra (postgres + localstack)
	docker compose up -d

up-all: ## Start infra + application services
	docker compose --profile app up -d

down: ## Stop everything, keeping volumes
	docker compose --profile app down

logs: ## Follow logs of all services
	docker compose --profile app logs -f

ps: ## Container status
	docker compose --profile app ps

reset: ## Stop everything and DELETE volumes (postgres and localstack data)
	docker compose --profile app down -v

lambdas: ## Build Lambda packages and redeploy them if LocalStack is running
	for fn in $(LAMBDAS); do \
		docker run --rm --user "$$(id -u):$$(id -g)" -e HOME=/tmp \
			-v "$(CURDIR)/lambdas/$$fn:/src" -w /src $(PYTHON_IMAGE) bash build.sh || exit 1; \
	done
	@if [ -n "$$(docker compose ps -q --status running localstack)" ]; then \
		docker compose exec -T localstack bash /etc/localstack/init/ready.d/02-lambdas.sh; \
	else \
		echo "[lambdas] LocalStack is not running; the package is deployed on its next start"; \
	fi

lambda-test: ## Run notify_order Lambda unit tests
	docker run --rm --user "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
		-v "$(CURDIR)/lambdas/notify_order:/src:ro" -w /src $(PYTHON_IMAGE) sh -c \
		'pip install --quiet --no-cache-dir --user -r requirements-dev.txt && python -m unittest -v'

pdf-tidy: ## Sync pdf-service go.mod/go.sum with its imports
	$(GO) go mod tidy

pdf-test: ## Run pdf-service unit tests
	$(GO) go test ./...

pdf-lint: ## Check pdf-service formatting and run go vet
	$(GO) sh -c 'unformatted=$$(gofmt -l cmd internal); if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi; go vet ./...'

aws-resources: ## List resources created in LocalStack
	@echo "--- s3 ---";       $(AWSLOCAL) s3 ls
	@echo "--- sqs ---";      $(AWSLOCAL) sqs list-queues
	@echo "--- sns ---";      $(AWSLOCAL) sns list-topics
	@echo "--- dynamodb ---"; $(AWSLOCAL) dynamodb list-tables
	@echo "--- lambda ---";   $(AWSLOCAL) lambda list-functions --query 'Functions[].FunctionName' --output text
	@echo "--- ssm ---";      $(AWSLOCAL) ssm get-parameters-by-path --path /order-platform --recursive \
		--query 'Parameters[].[Name,Value]' --output text
	@echo "--- secrets ---";  $(AWSLOCAL) secretsmanager list-secrets --query 'SecretList[].Name' --output text
