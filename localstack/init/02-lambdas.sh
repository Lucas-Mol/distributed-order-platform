#!/bin/bash

set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BUCKET="${S3_BUCKET:-orders-platform}"
IMAGE_PREFIX="${S3_PRODUCT_IMAGE_PREFIX:-products/}"
THUMBNAIL_PREFIX="${S3_THUMBNAIL_PREFIX:-thumbnails/}"
APP_ENV="${APP_ENV:-local}"
ACCOUNT_ID="000000000000"

THUMBNAIL_FN="image-thumbnail"
THUMBNAIL_ZIP="/opt/lambdas/image_thumbnail/function.zip"
THUMBNAIL_ROLE="${THUMBNAIL_FN}-role"

if [[ ! -f "${THUMBNAIL_ZIP}" ]]; then
  echo "[lambdas] ${THUMBNAIL_ZIP} not found; run 'make lambdas' to build and deploy it"
  exit 0
fi

# ---------- IAM (not enforced by LocalStack Community; kept so it carries over to AWS) ----------
if ! awslocal iam get-role --role-name "${THUMBNAIL_ROLE}" >/dev/null 2>&1; then
  awslocal iam create-role --role-name "${THUMBNAIL_ROLE}" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]
  }' >/dev/null
fi
awslocal iam put-role-policy --role-name "${THUMBNAIL_ROLE}" --policy-name "${THUMBNAIL_FN}" --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::${BUCKET}/${IMAGE_PREFIX}*\"},
    {\"Effect\": \"Allow\", \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::${BUCKET}/${THUMBNAIL_PREFIX}*\"},
    {\"Effect\": \"Allow\", \"Action\": \"ssm:GetParametersByPath\", \"Resource\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/order-platform/${APP_ENV}/shared\"},
    {\"Effect\": \"Allow\", \"Action\": [\"logs:CreateLogGroup\", \"logs:CreateLogStream\", \"logs:PutLogEvents\"], \"Resource\": \"*\"}
  ]
}"

# ---------- Function ----------
if awslocal lambda get-function --function-name "${THUMBNAIL_FN}" >/dev/null 2>&1; then
  awslocal lambda update-function-code --function-name "${THUMBNAIL_FN}" \
    --zip-file "fileb://${THUMBNAIL_ZIP}" >/dev/null
  echo "[lambdas] ${THUMBNAIL_FN} code updated"
else
  awslocal lambda create-function --function-name "${THUMBNAIL_FN}" \
    --runtime python3.12 --handler handler.handler \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/${THUMBNAIL_ROLE}" \
    --zip-file "fileb://${THUMBNAIL_ZIP}" \
    --timeout 30 --memory-size 512 \
    --environment "Variables={APP_ENV=${APP_ENV}}" >/dev/null
  awslocal lambda add-permission --function-name "${THUMBNAIL_FN}" \
    --statement-id s3-invoke --action lambda:InvokeFunction --principal s3.amazonaws.com \
    --source-arn "arn:aws:s3:::${BUCKET}" --source-account "${ACCOUNT_ID}" >/dev/null
  echo "[lambdas] ${THUMBNAIL_FN} created"
fi
awslocal lambda wait function-active-v2 --function-name "${THUMBNAIL_FN}"

# ---------- S3 trigger (only the image prefix; thumbnails live elsewhere, so no loop) ----------
awslocal s3api put-bucket-notification-configuration --bucket "${BUCKET}" --notification-configuration "{
  \"LambdaFunctionConfigurations\": [{
    \"Id\": \"${THUMBNAIL_FN}\",
    \"LambdaFunctionArn\": \"arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${THUMBNAIL_FN}\",
    \"Events\": [\"s3:ObjectCreated:*\"],
    \"Filter\": {\"Key\": {\"FilterRules\": [{\"Name\": \"prefix\", \"Value\": \"${IMAGE_PREFIX}\"}]}}
  }]
}"
echo "[lambdas] ${THUMBNAIL_FN} triggered by s3://${BUCKET}/${IMAGE_PREFIX}*"
