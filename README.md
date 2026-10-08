<div align="center">

# 🛒 Order Platform

**An event-driven, polyglot microservices e-commerce, built to explore software architecture on AWS. It runs entirely on your machine.**

[![English](https://img.shields.io/badge/lang-English-blue?style=flat-square)](README.md)
[![Português](https://img.shields.io/badge/lang-Portugu%C3%AAs%20(BR)-green?style=flat-square)](README.pt-BR.md)

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
<br/>
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)
![Amazon S3](https://img.shields.io/badge/S3-569A31?style=for-the-badge&logo=amazons3&logoColor=white)
![Amazon SQS](https://img.shields.io/badge/SQS-FF4F8B?style=for-the-badge&logo=amazonsqs&logoColor=white)
![Amazon SNS](https://img.shields.io/badge/SNS-FF4F8B?style=for-the-badge&logo=amazonsns&logoColor=white)
![AWS Lambda](https://img.shields.io/badge/Lambda-FF9900?style=for-the-badge&logo=awslambda&logoColor=white)
<br/>
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![LocalStack](https://img.shields.io/badge/LocalStack-1D2A5A?style=for-the-badge&logo=localstack&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)

</div>

---

## 📖 Table of contents

- [About](#-about)
- [Architecture at a glance](#%EF%B8%8F-architecture-at-a-glance)
- [Tech stack](#-tech-stack)
- [How an order flows](#-how-an-order-flows)
- [Architecture decisions](#-architecture-decisions)
- [Getting started](#-getting-started)
- [Extra commands](#%EF%B8%8F-extra-commands)
- [Reference](#-reference)
- [Repository layout](#-repository-layout)
- [Roadmap](#%EF%B8%8F-roadmap)

---

## 💡 About

Order Platform is a mini e-commerce with a catalog, cart, checkout and order tracking. The features are simple on purpose: the point of the project is the **architecture**. It is a small but realistic distributed system that puts into practice the patterns used in production platforms:

- **Microservices in three languages.** A TypeScript API, a Go worker and Python Lambdas, each one picked for the job it does.
- **Asynchronous processing.** Checkout returns right away. Invoice generation happens in the background, driven by queues and events.
- **Reliable messaging.** Transactional outbox, at-least-once delivery, idempotent consumers and dead-letter queues.
- **Nine AWS services.** S3, SQS, SNS, Lambda, DynamoDB, SSM Parameter Store, Secrets Manager, IAM and CloudWatch Logs, all emulated locally by **LocalStack**.
- **Security by design.** A backend-for-frontend with `httpOnly` cookies, presigned S3 URLs, role-based access, rate limiting and no secrets in environment files.

> 🧪 **No AWS account needed.** A single `docker compose` command starts all the infrastructure (queues, buckets, tables, Lambdas, parameters and secrets) inside LocalStack.

---

## 🏗️ Architecture at a glance

```mermaid
flowchart LR
    user(("👤 User"))

    subgraph web["Web tier"]
        fe["<b>Frontend</b><br/>Next.js · BFF"]
    end

    subgraph core["Core services"]
        be["<b>Backend API</b><br/>NestJS · Prisma"]
        pdf["<b>pdf-service</b><br/>Go · queue worker"]
    end

    subgraph data["Data"]
        pg[("<b>PostgreSQL</b><br/>users · products<br/>orders · outbox")]
        ddb[("<b>DynamoDB</b><br/>carts · product_cache")]
    end

    subgraph aws["AWS (LocalStack)"]
        s3[("<b>S3</b><br/>images · thumbnails<br/>invoices")]
        q1[["<b>SQS</b><br/>orders-queue"]]
        q2[["<b>SQS</b><br/>invoice-ready-queue"]]
        sns{{"<b>SNS</b><br/>order-notifications"}}
        lt["<b>λ image-thumbnail</b><br/>Python · Pillow"]
        ln["<b>λ notify-order</b><br/>Python · psycopg"]
        cfg["<b>SSM + Secrets Manager</b><br/>config · credentials"]
    end

    user -->|HTTPS| fe
    user -. "presigned PUT/GET" .-> s3
    fe -->|"REST + JWT"| be
    be --> pg
    be --> ddb
    be -->|"order.created"| q1
    be -->|presign| s3
    q1 --> pdf
    pdf -->|"invoice PDF"| s3
    pdf -->|"invoice.ready"| q2
    q2 --> ln
    ln -->|"status = READY"| pg
    ln --> sns
    s3 -->|"ObjectCreated"| lt
    lt -->|thumbnail| s3
    cfg -. "loaded at boot" .-> be & pdf & ln
```

| Component | Responsibility | Runs as |
|---|---|---|
| **Frontend** | UI and backend-for-frontend. Holds the JWT in an `httpOnly` cookie and calls the API from the server | Container |
| **Backend API** | Auth, catalog, cart, checkout, orders, presigned URLs, transactional outbox | Container |
| **pdf-service** | Consumes `order.created`, renders the invoice PDF, stores it in S3 and emits `invoice.ready` | Container (long-running worker) |
| **notify-order λ** | Consumes `invoice.ready`, marks the order `READY` and publishes to SNS | Lambda (SQS trigger) |
| **image-thumbnail λ** | Generates a 300 px thumbnail for every uploaded product image | Lambda (S3 trigger) |

> Two styles of compute side by side: a **persistent Go worker** that uses goroutines for throughput, and **event-driven Lambdas** for small, bursty post-processing tasks.

---

## 🧰 Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | **Next.js 16** (App Router) + TypeScript + Tailwind | Server Components and Server Actions make a clean BFF |
| API | **NestJS** + TypeScript + **Prisma** | Modular structure, DI, guards and type-safe data access |
| Worker | **Go** + [maroto](https://github.com/johnfercher/maroto) | Lightweight concurrent queue consumer for CPU-bound PDF rendering |
| Serverless | **Python** Lambdas (Pillow, psycopg) | Small event handlers that don't need a running server |
| SQL | **PostgreSQL 16** | Transactional data that needs referential integrity |
| NoSQL | **DynamoDB** | Hot key-value access: carts and the product cache with TTL |
| Messaging | **SQS** (+ DLQs) · **SNS** | Decoupling, retries and fan-out notifications |
| Storage | **S3** | Product images, thumbnails and invoice PDFs |
| Config & secrets | **SSM Parameter Store** · **Secrets Manager** | Centralized config, no secrets in `.env` |
| Local infra | **Docker Compose** + **LocalStack** | The whole cloud on a laptop |
| Quality | Vitest (unit + e2e) · oxlint · ESLint · `go test`/`go vet` · `unittest` | Tests and lint for every service |

---

## 🔄 How an order flows

### Checkout → invoice → notification

Checkout **never waits** for the invoice. The API answers as soon as the order is committed, and the rest happens asynchronously.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as Frontend (BFF)
    participant API as Backend API
    participant PG as PostgreSQL
    participant Q1 as SQS orders-queue
    participant GO as pdf-service (Go)
    participant S3 as S3
    participant Q2 as SQS invoice-ready-queue
    participant L as λ notify-order
    participant SNS as SNS

    U->>FE: Place order
    FE->>API: POST /orders/checkout
    API->>PG: BEGIN · insert order + order.created (outbox) · COMMIT
    API-->>FE: 201 Created (status CREATED)

    loop Outbox dispatcher (retries with backoff)
        API->>Q1: send order.created
        API->>PG: order → PROCESSING
    end

    Q1->>GO: long-poll (N concurrent workers)
    GO->>S3: put invoices/{order_id}.pdf
    GO->>Q2: send invoice.ready
    GO->>Q1: delete message (only after success)

    Q2->>L: trigger (batch)
    L->>PG: BEGIN · order → READY + invoice_key
    L->>SNS: publish notification
    L->>PG: COMMIT

    FE->>API: poll every 5 s while CREATED/PROCESSING
    U->>FE: Download invoice
    FE->>API: GET /orders/:id/invoice
    API-->>FE: presigned S3 URL (5 min)
    FE-->>U: 302 redirect → PDF downloaded from S3
```

### Order lifecycle

```mermaid
stateDiagram-v2
    direction LR
    [*] --> CREATED: checkout (same tx as outbox row)
    CREATED --> PROCESSING: event published to SQS
    PROCESSING --> READY: invoice generated (λ notify-order)
    READY --> DELIVERED
    CREATED --> CANCELLED
    PROCESSING --> CANCELLED
    DELIVERED --> [*]
    CANCELLED --> [*]
```

> `CREATED → PROCESSING → READY` is fully automated. `DELIVERED` and `CANCELLED` are part of the model; the flows that use them are on the roadmap.

### Product image upload

The bucket is private. File bytes never go through the API: the browser talks to S3 directly with short-lived presigned URLs.

```mermaid
sequenceDiagram
    autonumber
    actor M as Manager
    participant FE as Frontend
    participant API as Backend API
    participant S3 as S3 (private bucket)
    participant L as λ image-thumbnail

    M->>FE: Pick PNG/JPEG (≤ 5 MB)
    FE->>API: POST /products/:id/image-upload-url
    API-->>FE: presigned PUT (signs type + size, 5 min)
    FE->>S3: PUT products/{id}/{uuid}.png
    S3-)L: s3:ObjectCreated
    L->>S3: PUT thumbnails/products/... (300 px JPEG)
    FE->>API: PUT /products/:id/image
    API->>S3: HEAD + read magic bytes (PNG/JPEG signature)
    API-->>FE: 200 (or object deleted if rejected)
```

### Configuration and secrets

Services never read `.env`. They receive only the environment name and AWS access settings, then load everything else from AWS when they start, and fail fast if a value is missing.

```mermaid
flowchart LR
    boot["localstack/init<br/>01-bootstrap.sh"] -->|"creates"| ssm["SSM Parameter Store<br/>/order-platform/{env}/{shared|service}/..."]
    boot -->|"creates"| sm["Secrets Manager<br/>order-platform/{env}/..."]
    ssm --> be["Backend"] & go["pdf-service"] & lam["Lambdas"]
    sm --> be & lam
```

---

## 🧭 Architecture decisions

| Decision | Problem it solves | Trade-off |
|---|---|---|
| **Transactional outbox** (`order_events` table + dispatcher) | Avoids the dual-write problem: an order is never saved without its event, and an event is never sent for an order that was rolled back | Small delay before publishing; extra table and dispatcher |
| **At-least-once delivery + idempotent consumers** | Redelivered messages are harmless: the worker skips PDF generation when it already exists, and the Lambda never downgrades a status | Consumers must be written with idempotency in mind |
| **DLQ per queue** (`maxReceiveCount = 3`, 60 s visibility) | Poison messages don't block the queue or retry forever | DLQ messages are investigated manually |
| **Delete only after the side effect is confirmed** | No lost work if a worker crashes halfway | Possible duplicates, handled by idempotency |
| **Partial batch failures** in the Lambda | One bad message doesn't make the whole batch retry | More complex handler contract |
| **Go worker vs Lambda** | Long-running, CPU-bound PDF rendering goes to a concurrent worker; small, bursty handlers go to Lambda | Two runtime models to operate |
| **DynamoDB cart with a name/price snapshot** | Cart operations never touch Postgres; checkout returns `409` with a refreshed cart if a price changed | Snapshot can go stale and is checked at checkout |
| **Cache-aside product cache with TTL** | Fewer reads on Postgres for hot products; cache failures fall back to the database | Short window of stale data (5 min TTL) |
| **Backend-for-frontend** | JWT lives in an `httpOnly` cookie and the API URL is server-only: no token in browser JS and no CORS | The frontend server sits on the request path |
| **Presigned S3 URLs** | Uploads and downloads skip the API; the bucket stays private | Server must check the uploaded object (size, type, magic bytes) |
| **SSM + Secrets Manager instead of `.env`** | One source of truth per environment; on AWS, IAM roles scoped per service prefix | Services depend on AWS being reachable at boot |
| **Versioned event contract** ([`docs/events.md`](docs/events.md)) | Producers and consumers in different languages agree on an explicit envelope (`event`, `version`, `occurred_at`, `data`) | Format changes need a new version and a transition period |

---

## 🚀 Getting started

### Prerequisites

- **Docker** with Docker Compose v2 (on Windows, Docker Desktop with WSL integration)
- **make**
- *(optional)* AWS CLI, to inspect LocalStack resources with `make aws-resources`

No Node, Go or Python toolchain is required: everything builds and runs in containers.

### Step by step

```bash
# 1. Clone the repository
git clone https://github.com/Lucas-Mol/order-platform-microservice-project.git
cd order-platform-microservice-project

# 2. Create your local environment file
cp .env.example .env

# 3. Build the Lambda packages (deployed automatically when LocalStack starts)
make lambdas

# 4. Start the infrastructure and every service
docker compose --profile app up -d --build

# 5. Wait until LocalStack has finished bootstrapping AWS resources
docker compose logs -f localstack     # look for "[bootstrap] done", then Ctrl+C

# 6. Load sample products
docker compose exec backend npm run db:seed
```

Open **http://localhost:3000** and create an account. 🎉

To manage the catalog, promote your account (there are no default admin credentials):

```bash
docker compose exec backend npm run user:set-role -- you@example.com ADMIN
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3333 ([`/health`](http://localhost:3333/health)) |
| pdf-service | http://localhost:8080 ([`/healthz`](http://localhost:8080/healthz)) |
| LocalStack | http://localhost:4566 |
| PostgreSQL | `localhost:5432` |

### Try the full flow

1. As a **manager**, go to `/admin/products`, create a product and upload a photo. A thumbnail shows up a few seconds later, generated by a Lambda.
2. As a **customer**, add items to the cart. The cart is stored in DynamoDB.
3. **Check out** and open *My orders*. You will see the order move `CREATED → PROCESSING → READY` while the Go worker and the Lambda do their work.
4. **Download the invoice PDF** from S3 through a presigned URL.
5. Run `make aws-resources` to see the buckets, queues, topic, tables, Lambdas and parameters that were created.

---

## 🛠️ Extra commands

### Make targets

Run `make help` to list them all.

| Command | What it does |
|---|---|
| `make up` | Start infrastructure only (Postgres + LocalStack) |
| `make up-all` | Start infrastructure + application services |
| `make down` | Stop everything, keeping volumes |
| `make logs` | Follow the logs of every service |
| `make ps` | Container status |
| `make reset` | ⚠️ Stop everything and **delete volumes** (Postgres and LocalStack data) |
| `make aws-resources` | List S3, SQS, SNS, DynamoDB, Lambda, SSM and Secrets Manager resources (secret values are never printed) |
| `make lambdas` | Build every `lambdas/*/function.zip` and redeploy it if LocalStack is running |
| `make lambda-test` | Run the `notify-order` Lambda unit tests |
| `make pdf-test` | Run the Go `pdf-service` unit tests |
| `make pdf-lint` | `gofmt` + `go vet` on `pdf-service` |
| `make pdf-tidy` | Sync `go.mod`/`go.sum` |

### Docker Compose

```bash
docker compose up -d                                        # infra only
docker compose --profile app up -d                          # everything
docker compose --profile app up -d --build pdf-service      # rebuild a single service
docker compose --profile app up -d --build -V backend       # rebuild after dependency changes (-V drops the old node_modules volume)
docker compose logs -f backend pdf-service                  # follow specific services
docker compose exec backend npm run db:seed                 # seed sample products
docker compose exec backend npm run user:set-role -- <email> <CUSTOMER|MANAGER|ADMIN>
```

### Tests and lint

```bash
# Backend (inside the container, or on the host in backend/)
docker compose exec backend npm run lint
docker compose exec backend npm test
docker compose exec -e TEST_DATABASE_URL=postgresql://orders:orders@postgres:5432/orders_test backend npm run test:e2e

# Frontend
docker compose exec frontend npm run lint

# Go worker and Python Lambdas (containerized, no local toolchain)
make pdf-test pdf-lint lambda-test
```

The e2e suite creates and migrates the `*_test` database it is given, truncates it between tests and refuses any database whose name does not end in `_test`.

<details>
<summary><b>Running backend and frontend on the host</b></summary>

Node 22 and npm 11 recommended. The Prisma CLI never reads a URL from a file: `db:*` scripts build `DATABASE_URL` from the `database` secret for that process only.

```bash
make up   # infra only

cd backend
npm ci
export APP_ENV=local AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
       AWS_ENDPOINT_URL=http://localhost:4566 DATABASE_HOST=localhost
npm run db:deploy && npm run db:seed
npm run start:dev
```

```bash
cd frontend
npm ci
API_URL=http://localhost:3333 npm run dev
npm run lint && npm run build
```

`DATABASE_HOST`/`DATABASE_PORT` are accepted only when `APP_ENV=local`.

</details>

---

## 📚 Reference

<details>
<summary><b>API routes</b></summary>

| Route | Auth | Description |
|---|---|---|
| `POST /auth/register`, `POST /auth/login` | — | Create an account / get a bearer token |
| `GET /products`, `GET /products/:id` | — | Catalog (`?limit=&offset=`, `?q=` matches name or description) |
| `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` | `MANAGER` | Catalog management |
| `POST /products/:id/image-upload-url`, `PUT /products/:id/image`, `DELETE /products/:id/image` | `MANAGER` | Product photo: presigned upload, attach after checks, remove |
| `GET /cart`, `POST /cart/items/:productId` (add), `PUT /cart/items/:productId` (set), `DELETE /cart/items/:productId`, `DELETE /cart` | `CUSTOMER` | Cart in DynamoDB with a name/price snapshot (up to 50 products, 100 units each) |
| `POST /orders/checkout`, `POST /orders`, `GET /orders`, `GET /orders/:id` | `CUSTOMER` | Checkout of the cart (`409` and refreshed cart if a price changed) or of explicit items, and order lookup scoped to the token's user |
| `GET /orders/:id/invoice` | `CUSTOMER` | Presigned invoice download (5 min) once the order is `READY`/`DELIVERED`; `409` before that |
| `GET /users/me` | `CUSTOMER` | Current user and role |
| `GET /users`, `PATCH /users/:id/role` | `ADMIN` | User listing and role management |
| `GET /health` | — | Postgres check |

</details>

<details>
<summary><b>Roles and rate limiting</b></summary>

Roles are hierarchical: each one includes the permissions of the ones below it.

| Role | Can |
|---|---|
| `CUSTOMER` (default on registration) | Browse, manage own cart, place and view own orders |
| `MANAGER` | Everything above + create, update and delete products |
| `ADMIN` | Everything above + list users and change their roles |

The role is read from the database on every request, so promotions and demotions apply to existing tokens immediately. Admins cannot change their own role.

**Rate limiting** is per client IP and per route, in memory (single instance). Limits come from SSM (`rate-limit-ttl-seconds`, `rate-limit-max`, and `auth-rate-limit-max` for login/registration, applied per IP and per email). Requests over the limit get `429` with a `Retry-After` header, and `/health` is never limited. The frontend forwards the browser IP in `X-Forwarded-For`. The backend only trusts that header from the proxies listed in `/order-platform/{env}/backend/trusted-proxies`.

</details>

<details>
<summary><b>Configuration and secrets layout</b></summary>

| Kind | Where | Examples |
|---|---|---|
| Configuration | SSM Parameter Store, `/order-platform/{env}/{shared\|service}/...` | `/order-platform/local/shared/sqs-orders-queue`, `/order-platform/local/pdf-service/worker-concurrency` |
| Secrets | Secrets Manager, `order-platform/{env}/...` | `order-platform/local/database`, `order-platform/local/backend/jwt-secret` |

- `localstack/init/01-bootstrap.sh` creates the parameters and secrets every time LocalStack starts. Values come from the "bootstrap input" section of `.env`, except the JWT secret, which is randomly generated each time (tokens issued before a LocalStack restart stop working).
- The LocalStack healthcheck only passes after the bootstrap finishes, so application services never start without their configuration.
- On real AWS, services get access through an IAM role scoped to their own prefix instead of static keys. LocalStack Community does not enforce IAM and stores secrets unencrypted in its volume. Locally, this setup mirrors the production architecture but does not protect the values.

</details>

<details>
<summary><b>Event contract</b></summary>

Every queue payload follows a versioned JSON envelope. See [`docs/events.md`](docs/events.md) for `order.created`, `invoice.ready`, the SNS notification and the failure-handling rules.

```json
{
  "event": "order.created",
  "version": 1,
  "occurred_at": "2026-01-15T12:00:00Z",
  "data": { "order_id": "8f1c...", "total_cents": 12990, "items": [] }
}
```

</details>

---

## 📁 Repository layout

```
.
├── backend/          # NestJS API: auth, products, cart (DynamoDB), orders + outbox, S3 presign
│   ├── prisma/       # schema, migrations, seed
│   └── test/         # e2e suites (Vitest)
├── frontend/         # Next.js BFF: catalog, cart, checkout, orders, admin
├── pdf-service/      # Go worker: SQS consumer → PDF (maroto) → S3 → invoice.ready
├── lambdas/
│   ├── image_thumbnail/   # S3 trigger → 300 px thumbnail (Pillow)
│   └── notify_order/      # SQS trigger → order READY + SNS (psycopg)
├── localstack/init/  # bootstrap: bucket, queues + DLQs, topic, tables, SSM, secrets, Lambdas
├── docs/events.md    # versioned event contract
├── docker-compose.yml
└── Makefile
```

---

## 🗺️ Roadmap

- [x] **Stage 0**: Foundation (Docker Compose, LocalStack bootstrap, SSM + Secrets Manager)
- [x] **Stage 1**: Backend + PostgreSQL (JWT, roles, catalog, orders, rate limiting)
- [x] **Stage 2**: Web frontend (BFF, catalog, cart, checkout, order tracking, admin)
- [x] **Stage 3**: S3 presigned uploads + `image-thumbnail` Lambda
- [x] **Stage 4**: Transactional outbox + `orders-queue` + Go PDF service
- [x] **Stage 5**: `notify-order` Lambda + SNS + invoice download
- [x] **Stage 6**: DynamoDB cart and product cache
- [ ] **Stage 7**: Final containerization and MVP wrap-up

**Next ideas:** IaC (Terraform/CDK) for a real AWS deploy · observability (structured logs, metrics, tracing) · on-demand reports in the Go service · payment gateway integration · refresh tokens / OAuth · load testing on the queue pipeline.

---

<div align="center">

Built by **[Lucas Mol](https://github.com/Lucas-Mol)** as a hands-on study of distributed systems and software architecture.

⭐ If this project helped you or you found it interesting, consider giving it a star!

</div>
