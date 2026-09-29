SHELL := /bin/bash
AWSLOCAL := aws --endpoint-url http://localhost:4566

.PHONY: help up up-all down logs ps reset aws-resources

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

aws-resources: ## List resources created in LocalStack
	@echo "--- s3 ---";       $(AWSLOCAL) s3 ls
	@echo "--- sqs ---";      $(AWSLOCAL) sqs list-queues
	@echo "--- sns ---";      $(AWSLOCAL) sns list-topics
	@echo "--- dynamodb ---"; $(AWSLOCAL) dynamodb list-tables
	@echo "--- ssm ---";      $(AWSLOCAL) ssm get-parameters-by-path --path /order-platform --recursive \
		--query 'Parameters[].[Name,Value]' --output text
	@echo "--- secrets ---";  $(AWSLOCAL) secretsmanager list-secrets --query 'SecretList[].Name' --output text
