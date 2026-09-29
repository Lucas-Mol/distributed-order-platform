# Order Platform

Containerized, event-driven mini e-commerce: catalog, cart, checkout and order tracking, with asynchronous processing through a queue.

| Layer | Stack |
|---|---|
| Frontend | Next.js + TypeScript |
| Backend | NestJS + TypeScript + Prisma |
| PDF generator | Go (queue worker) |
| SQL | PostgreSQL |
| NoSQL | DynamoDB |
| Storage / Queue / Notification | S3 / SQS / SNS |
| Serverless | Python Lambda |
| Configuration / secrets | SSM Parameter Store / Secrets Manager |
| Local infra | Docker Compose + LocalStack |

- **Event contract:** [`events.md`](./docs/events.md)

## Running the local environment

Requires Docker with WSL integration enabled.

```bash
cp .env.example .env
docker compose up -d          # postgres + localstack
docker compose logs -f localstack   # wait for "[bootstrap] done"
```

Application services live in the `app` profile and only start once there is code:

```bash
docker compose --profile app up -d
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3333 |
| LocalStack | http://localhost:4566 |
| Postgres | localhost:5432 |

To inspect LocalStack resources from the host (secret values are never printed):

```bash
make aws-resources
```

## Configuration and secrets

Application services do not read `.env`. They receive only the AWS access settings (`APP_ENV`, region, endpoint, credentials) and load everything else at boot:

| Kind | Where | Examples |
|---|---|---|
| Configuration | SSM Parameter Store, `/order-platform/{env}/{shared\|service}/...` | `/order-platform/local/shared/sqs-orders-queue`, `/order-platform/local/pdf-service/worker-concurrency` |
| Secrets | Secrets Manager, `order-platform/{env}/...` | `order-platform/local/database`, `order-platform/local/backend/jwt-secret` |

- `localstack/init/01-bootstrap.sh` creates the parameters and secrets on every LocalStack start. The values come from the "bootstrap input" section of `.env`, except the JWT secret, which is generated randomly each time, so tokens issued before a LocalStack restart stop working.
- The LocalStack healthcheck only passes after the bootstrap finishes, so application services never start without their configuration.
- On real AWS, services get access through an IAM role scoped to their own prefix instead of static keys. LocalStack Community does not enforce IAM and stores secrets unencrypted in its volume: locally this setup mirrors the production architecture, it does not protect the values.

## Status

Stage 0 (foundation) done. Next: Stage 1 — backend + Postgres.
