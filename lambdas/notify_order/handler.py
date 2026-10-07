"""Marks an order READY when its invoice is stored and notifies subscribers.

Triggered by SQS (invoice-ready-queue) with ReportBatchItemFailures, so only the
messages that failed go back to the queue (and to the DLQ after 3 attempts).
"""

import json
import logging
import os
import re
from dataclasses import dataclass

import boto3
import psycopg

logger = logging.getLogger()
logger.setLevel(logging.INFO)

UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CONNECT_TIMEOUT_SECONDS = 5
STATEMENT_TIMEOUT_MS = 5000


class InvalidEvent(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    invoice_prefix: str
    topic_arn: str
    database: dict


@dataclass(frozen=True)
class InvoiceReady:
    order_id: str
    invoice_key: str


_settings: Settings | None = None
_connection: psycopg.Connection | None = None
_sns = None


def load_settings() -> Settings:
    env = os.environ["APP_ENV"]
    path = f"/order-platform/{env}/shared"
    values: dict[str, str] = {}
    for page in boto3.client("ssm").get_paginator("get_parameters_by_path").paginate(Path=path):
        for param in page["Parameters"]:
            values[param["Name"].removeprefix(f"{path}/")] = param["Value"]
    missing = {"s3-invoice-prefix", "sns-order-topic"} - values.keys()
    if missing:
        raise RuntimeError(f"Missing SSM parameters under {path}: {sorted(missing)}")

    secret = boto3.client("secretsmanager").get_secret_value(SecretId=f"order-platform/{env}/database")
    database = json.loads(secret["SecretString"])

    region = boto3.session.Session().region_name
    account = boto3.client("sts").get_caller_identity()["Account"]
    return Settings(
        invoice_prefix=values["s3-invoice-prefix"],
        topic_arn=f"arn:aws:sns:{region}:{account}:{values['sns-order-topic']}",
        database=database,
    )


def settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def sns_client():
    global _sns
    if _sns is None:
        _sns = boto3.client("sns")
    return _sns


def connection() -> psycopg.Connection:
    global _connection
    if _connection is None or _connection.closed or _connection.broken:
        db = settings().database
        _connection = psycopg.connect(
            host=db["host"],
            port=db["port"],
            user=db["username"],
            password=db["password"],
            dbname=db["dbname"],
            connect_timeout=CONNECT_TIMEOUT_SECONDS,
            options=f"-c statement_timeout={STATEMENT_TIMEOUT_MS}",
            autocommit=True,
        )
    return _connection


def parse_invoice_ready(body: str, invoice_prefix: str) -> InvoiceReady:
    try:
        envelope = json.loads(body)
    except json.JSONDecodeError as error:
        raise InvalidEvent(f"malformed JSON: {error}") from error
    if not isinstance(envelope, dict) or envelope.get("event") != "invoice.ready" or envelope.get("version") != 1:
        raise InvalidEvent("unsupported event")

    data = envelope.get("data")
    if not isinstance(data, dict):
        raise InvalidEvent("invoice.ready has no data")
    order_id = data.get("order_id")
    invoice_key = data.get("invoice_key")
    if not isinstance(order_id, str) or not UUID_PATTERN.match(order_id):
        raise InvalidEvent("invoice.ready order_id is not a lowercase UUID")
    if invoice_key != f"{invoice_prefix}{order_id}.pdf":
        raise InvalidEvent(f"invoice.ready for order {order_id} has an unexpected invoice_key")
    return InvoiceReady(order_id=order_id, invoice_key=invoice_key)


def mark_ready(conn: psycopg.Connection, sns, topic_arn: str, event: InvoiceReady) -> bool:
    with conn.transaction():
        updated = conn.execute(
            """
            UPDATE orders
            SET status = 'READY', invoice_key = %s, updated_at = now()
            WHERE id = %s AND status IN ('CREATED', 'PROCESSING')
            RETURNING id
            """,
            (event.invoice_key, event.order_id),
        ).fetchone()
        if updated is None:
            current = conn.execute("SELECT status FROM orders WHERE id = %s", (event.order_id,)).fetchone()
            if current is None:
                raise InvalidEvent(f"order {event.order_id} does not exist")
            logger.info("Order %s is already %s; nothing to do", event.order_id, current[0])
            return False

        sns.publish(
            TopicArn=topic_arn,
            Message=json.dumps(
                {"order_id": event.order_id, "status": "READY", "invoice_key": event.invoice_key}
            ),
        )
    logger.info("Order %s is READY", event.order_id)
    return True


def handler(event, _context):
    failures = []
    for record in event.get("Records", []):
        message_id = record.get("messageId")
        try:
            config = settings()
            ready = parse_invoice_ready(record.get("body", ""), config.invoice_prefix)
            mark_ready(connection(), sns_client(), config.topic_arn, ready)
        except Exception:
            logger.exception("Message %s failed; it will be retried", message_id)
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
