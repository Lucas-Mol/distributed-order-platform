import json
import os
import unittest
from contextlib import nullcontext
from unittest import mock

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

import handler  # noqa: E402

handler.logger.disabled = True

ORDER_ID = "8f1c0000-0000-4000-8000-000000000001"
INVOICE_KEY = f"invoices/{ORDER_ID}.pdf"
TOPIC_ARN = "arn:aws:sns:us-east-1:000000000000:order-notifications"


def invoice_ready(**data_overrides) -> str:
    data = {"order_id": ORDER_ID, "user_email": "customer@example.com", "invoice_key": INVOICE_KEY}
    data.update(data_overrides)
    return json.dumps({"event": "invoice.ready", "version": 1, "occurred_at": "2026-01-15T12:00:03Z", "data": data})


def fake_connection(*rows):
    conn = mock.MagicMock()
    conn.transaction.return_value = nullcontext()
    conn.execute.return_value.fetchone.side_effect = list(rows)
    return conn


class ParseInvoiceReadyTest(unittest.TestCase):
    def test_valid(self):
        event = handler.parse_invoice_ready(invoice_ready(), "invoices/")
        self.assertEqual(event, handler.InvoiceReady(order_id=ORDER_ID, invoice_key=INVOICE_KEY))

    def test_rejects(self):
        cases = {
            "malformed JSON": "{",
            "other event": json.dumps({"event": "order.created", "version": 1, "data": {}}),
            "other version": json.dumps({"event": "invoice.ready", "version": 2, "data": {}}),
            "no data": json.dumps({"event": "invoice.ready", "version": 1}),
            "non-UUID order id": invoice_ready(order_id="../x"),
            "foreign invoice key": invoice_ready(invoice_key="products/evil.pdf"),
        }
        for name, body in cases.items():
            with self.subTest(name), self.assertRaises(handler.InvalidEvent):
                handler.parse_invoice_ready(body, "invoices/")


class MarkReadyTest(unittest.TestCase):
    event = handler.InvoiceReady(order_id=ORDER_ID, invoice_key=INVOICE_KEY)

    def test_updates_and_publishes(self):
        conn, sns = fake_connection((ORDER_ID,)), mock.MagicMock()
        self.assertTrue(handler.mark_ready(conn, sns, TOPIC_ARN, self.event))
        sql, params = conn.execute.call_args.args
        self.assertIn("status IN ('CREATED', 'PROCESSING')", sql)
        self.assertEqual(params, (INVOICE_KEY, ORDER_ID))
        sns.publish.assert_called_once()
        kwargs = sns.publish.call_args.kwargs
        self.assertEqual(kwargs["TopicArn"], TOPIC_ARN)
        self.assertEqual(
            json.loads(kwargs["Message"]), {"order_id": ORDER_ID, "status": "READY", "invoice_key": INVOICE_KEY}
        )

    def test_order_already_past_processing_is_not_notified_again(self):
        conn, sns = fake_connection(None, ("DELIVERED",)), mock.MagicMock()
        self.assertFalse(handler.mark_ready(conn, sns, TOPIC_ARN, self.event))
        sns.publish.assert_not_called()

    def test_missing_order_fails(self):
        conn, sns = fake_connection(None, None), mock.MagicMock()
        with self.assertRaises(handler.InvalidEvent):
            handler.mark_ready(conn, sns, TOPIC_ARN, self.event)
        sns.publish.assert_not_called()

    def test_sns_failure_propagates_inside_the_transaction(self):
        conn, sns = fake_connection((ORDER_ID,)), mock.MagicMock()
        transaction = mock.MagicMock()
        conn.transaction.return_value = transaction
        sns.publish.side_effect = RuntimeError("sns down")
        with self.assertRaises(RuntimeError):
            handler.mark_ready(conn, sns, TOPIC_ARN, self.event)
        exc_type = transaction.__exit__.call_args.args[0]
        self.assertIs(exc_type, RuntimeError)


class HandlerTest(unittest.TestCase):
    def setUp(self):
        settings = handler.Settings(invoice_prefix="invoices/", topic_arn=TOPIC_ARN, database={})
        patches = [
            mock.patch.object(handler, "settings", return_value=settings),
            mock.patch.object(handler, "connection"),
            mock.patch.object(handler, "sns_client"),
            mock.patch.object(handler, "mark_ready"),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def test_reports_only_failed_messages(self):
        handler.mark_ready.side_effect = [True, RuntimeError("db down")]
        result = handler.handler(
            {
                "Records": [
                    {"messageId": "ok", "body": invoice_ready()},
                    {"messageId": "invalid", "body": "{"},
                    {"messageId": "db", "body": invoice_ready()},
                ]
            },
            None,
        )
        self.assertEqual(result, {"batchItemFailures": [{"itemIdentifier": "invalid"}, {"itemIdentifier": "db"}]})


if __name__ == "__main__":
    unittest.main()
