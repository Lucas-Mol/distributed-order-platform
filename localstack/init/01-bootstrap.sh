#!/bin/bash

# Creates the S3 bucket, SQS queues, SNS topic and DynamoDB tables,
# then publishes configuration to SSM and secrets to Secrets Manager.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BUCKET="${S3_BUCKET:-orders-platform}"
ORDERS_QUEUE="${SQS_ORDERS_QUEUE:-orders-queue}"
INVOICE_QUEUE="${SQS_INVOICE_READY_QUEUE:-invoice-ready-queue}"
TOPIC="${SNS_ORDER_TOPIC:-order-notifications}"
CARTS_TABLE="${DYNAMO_CARTS_TABLE:-carts}"
STOCK_TABLE="${DYNAMO_STOCK_CACHE_TABLE:-stock_cache}"
APP_ENV="${APP_ENV:-local}"
SSM_PREFIX="/order-platform/${APP_ENV}"
SECRET_PREFIX="order-platform/${APP_ENV}"

echo "[bootstrap] region=${REGION}"

# ---------- S3 ----------
awslocal s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }]
}'
echo "[bootstrap] bucket ${BUCKET} created"

# ---------- SQS (queue + DLQ with redrive) ----------
create_queue_with_dlq() {
  local name="$1"
  local dlq_url dlq_arn
  dlq_url=$(awslocal sqs create-queue --queue-name "${name}-dlq" --output text --query QueueUrl)
  dlq_arn=$(awslocal sqs get-queue-attributes --queue-url "${dlq_url}" \
    --attribute-names QueueArn --output text --query 'Attributes.QueueArn')
  awslocal sqs create-queue --queue-name "${name}" --attributes "{
    \"VisibilityTimeout\": \"60\",
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
  }" >/dev/null
  echo "[bootstrap] queue ${name} created"
}

create_queue_with_dlq "${ORDERS_QUEUE}"
create_queue_with_dlq "${INVOICE_QUEUE}"

# ---------- SNS ----------
awslocal sns create-topic --name "${TOPIC}" >/dev/null
echo "[bootstrap] topic ${TOPIC} created"

# ---------- DynamoDB ----------
awslocal dynamodb create-table \
  --table-name "${CARTS_TABLE}" \
  --attribute-definitions AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null
echo "[bootstrap] table ${CARTS_TABLE} created"

awslocal dynamodb create-table \
  --table-name "${STOCK_TABLE}" \
  --attribute-definitions AttributeName=product_id,AttributeType=S \
  --key-schema AttributeName=product_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null
awslocal dynamodb update-time-to-live \
  --table-name "${STOCK_TABLE}" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" >/dev/null
echo "[bootstrap] table ${STOCK_TABLE} created"

# ---------- SSM Parameter Store ----------
put_param() {
  awslocal ssm put-parameter --name "${SSM_PREFIX}/$1" --value "$2" \
    --type String --overwrite >/dev/null
  echo "[bootstrap] parameter ${SSM_PREFIX}/$1 set"
}

put_param shared/s3-bucket "${BUCKET}"
put_param shared/s3-product-image-prefix "${S3_PRODUCT_IMAGE_PREFIX:-products/}"
put_param shared/s3-invoice-prefix "${S3_INVOICE_PREFIX:-invoices/}"
put_param shared/sqs-orders-queue "${ORDERS_QUEUE}"
put_param shared/sqs-invoice-ready-queue "${INVOICE_QUEUE}"
put_param shared/sns-order-topic "${TOPIC}"
put_param shared/dynamo-carts-table "${CARTS_TABLE}"
put_param shared/dynamo-stock-cache-table "${STOCK_TABLE}"
put_param backend/jwt-expires-in "${JWT_EXPIRES_IN:-1h}"
put_param pdf-service/worker-concurrency "${PDF_WORKER_CONCURRENCY:-4}"

# ---------- Secrets Manager ----------
db_secret=$(python3 -c '
import json, os
print(json.dumps({
    "engine": "postgres",
    "host": "postgres",
    "port": 5432,
    "username": os.environ["POSTGRES_USER"],
    "password": os.environ["POSTGRES_PASSWORD"],
    "dbname": os.environ["POSTGRES_DB"],
}))')
awslocal secretsmanager create-secret --name "${SECRET_PREFIX}/database" \
  --secret-string "${db_secret}" >/dev/null
echo "[bootstrap] secret ${SECRET_PREFIX}/database created"

jwt_secret=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
awslocal secretsmanager create-secret --name "${SECRET_PREFIX}/backend/jwt-secret" \
  --secret-string "${jwt_secret}" >/dev/null
echo "[bootstrap] secret ${SECRET_PREFIX}/backend/jwt-secret created"

put_param bootstrap/completed true

echo "[bootstrap] done"
