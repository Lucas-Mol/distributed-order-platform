#!/bin/bash

set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BUCKET="${S3_BUCKET:-orders-platform}"
IMAGE_PREFIX="${S3_PRODUCT_IMAGE_PREFIX:-products/}"
THUMBNAIL_PREFIX="${S3_THUMBNAIL_PREFIX:-thumbnails/}"
INVOICE_QUEUE="${SQS_INVOICE_READY_QUEUE:-invoice-ready-queue}"
TOPIC="${SNS_ORDER_TOPIC:-order-notifications}"
APP_ENV="${APP_ENV:-local}"
ACCOUNT_ID="000000000000"
SHARED_PARAMS_ARN="arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/order-platform/${APP_ENV}/shared"
LOGS_STATEMENT='{"Effect": "Allow", "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], "Resource": "*"}'

ensure_role() {
  local fn="$1" statements="$2"
  local role="${fn}-role"
  if ! awslocal iam get-role --role-name "${role}" >/dev/null 2>&1; then
    awslocal iam create-role --role-name "${role}" --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    }' >/dev/null
  fi
  awslocal iam put-role-policy --role-name "${role}" --policy-name "${fn}" \
    --policy-document "{\"Version\": \"2012-10-17\", \"Statement\": [${statements}, ${LOGS_STATEMENT}]}"
}

deploy_function() {
  local fn="$1" zip="$2" timeout="$3" memory="$4"
  if awslocal lambda get-function --function-name "${fn}" >/dev/null 2>&1; then
    awslocal lambda update-function-code --function-name "${fn}" --zip-file "fileb://${zip}" >/dev/null
    awslocal lambda wait function-updated-v2 --function-name "${fn}"
    echo "[lambdas] ${fn} code updated"
    return 1
  fi
  awslocal lambda create-function --function-name "${fn}" \
    --runtime python3.12 --handler handler.handler \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/${fn}-role" \
    --zip-file "fileb://${zip}" \
    --timeout "${timeout}" --memory-size "${memory}" \
    --environment "Variables={APP_ENV=${APP_ENV}}" >/dev/null
  awslocal lambda wait function-active-v2 --function-name "${fn}"
  echo "[lambdas] ${fn} created"
}

THUMBNAIL_FN="image-thumbnail"
THUMBNAIL_ZIP="/opt/lambdas/image_thumbnail/function.zip"

if [[ -f "${THUMBNAIL_ZIP}" ]]; then
  ensure_role "${THUMBNAIL_FN}" "
    {\"Effect\": \"Allow\", \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::${BUCKET}/${IMAGE_PREFIX}*\"},
    {\"Effect\": \"Allow\", \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::${BUCKET}/${THUMBNAIL_PREFIX}*\"},
    {\"Effect\": \"Allow\", \"Action\": \"ssm:GetParametersByPath\", \"Resource\": \"${SHARED_PARAMS_ARN}\"}"
  if deploy_function "${THUMBNAIL_FN}" "${THUMBNAIL_ZIP}" 30 512; then
    awslocal lambda add-permission --function-name "${THUMBNAIL_FN}" \
      --statement-id s3-invoke --action lambda:InvokeFunction --principal s3.amazonaws.com \
      --source-arn "arn:aws:s3:::${BUCKET}" --source-account "${ACCOUNT_ID}" >/dev/null
  fi
  awslocal s3api put-bucket-notification-configuration --bucket "${BUCKET}" --notification-configuration "{
    \"LambdaFunctionConfigurations\": [{
      \"Id\": \"${THUMBNAIL_FN}\",
      \"LambdaFunctionArn\": \"arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${THUMBNAIL_FN}\",
      \"Events\": [\"s3:ObjectCreated:*\"],
      \"Filter\": {\"Key\": {\"FilterRules\": [{\"Name\": \"prefix\", \"Value\": \"${IMAGE_PREFIX}\"}]}}
    }]
  }"
  echo "[lambdas] ${THUMBNAIL_FN} triggered by s3://${BUCKET}/${IMAGE_PREFIX}*"
else
  echo "[lambdas] ${THUMBNAIL_ZIP} not found; run 'make lambdas' to build and deploy it"
fi

NOTIFY_FN="notify-order"
NOTIFY_ZIP="/opt/lambdas/notify_order/function.zip"
INVOICE_QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${INVOICE_QUEUE}"

if [[ -f "${NOTIFY_ZIP}" ]]; then
  ensure_role "${NOTIFY_FN}" "
    {\"Effect\": \"Allow\", \"Action\": [\"sqs:ReceiveMessage\", \"sqs:DeleteMessage\", \"sqs:GetQueueAttributes\"], \"Resource\": \"${INVOICE_QUEUE_ARN}\"},
    {\"Effect\": \"Allow\", \"Action\": \"sns:Publish\", \"Resource\": \"arn:aws:sns:${REGION}:${ACCOUNT_ID}:${TOPIC}\"},
    {\"Effect\": \"Allow\", \"Action\": \"secretsmanager:GetSecretValue\", \"Resource\": \"arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:order-platform/${APP_ENV}/database-*\"},
    {\"Effect\": \"Allow\", \"Action\": \"ssm:GetParametersByPath\", \"Resource\": \"${SHARED_PARAMS_ARN}\"}"
  deploy_function "${NOTIFY_FN}" "${NOTIFY_ZIP}" 10 256 || true
  mappings=$(awslocal lambda list-event-source-mappings --function-name "${NOTIFY_FN}" \
    --event-source-arn "${INVOICE_QUEUE_ARN}" --query 'length(EventSourceMappings)' --output text)
  if [[ "${mappings}" == "0" ]]; then
    awslocal lambda create-event-source-mapping --function-name "${NOTIFY_FN}" \
      --event-source-arn "${INVOICE_QUEUE_ARN}" --batch-size 10 \
      --function-response-types ReportBatchItemFailures >/dev/null
  fi
  echo "[lambdas] ${NOTIFY_FN} triggered by ${INVOICE_QUEUE}"
else
  echo "[lambdas] ${NOTIFY_ZIP} not found; run 'make lambdas' to build and deploy it"
fi
