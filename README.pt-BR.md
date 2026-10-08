<div align="center">

# 🛒 Order Platform

**Um e-commerce com microsserviços poliglotas e orientado a eventos, construído para explorar arquitetura de software na AWS. Roda inteiro na sua máquina.**

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

## 📖 Sumário

- [Sobre](#-sobre)
- [Arquitetura em visão geral](#%EF%B8%8F-arquitetura-em-visão-geral)
- [Stack de tecnologias](#-stack-de-tecnologias)
- [Como um pedido flui](#-como-um-pedido-flui)
- [Decisões de arquitetura](#-decisões-de-arquitetura)
- [Como rodar](#-como-rodar)
- [Comandos extras](#%EF%B8%8F-comandos-extras)
- [Referência](#-referência)
- [Estrutura do repositório](#-estrutura-do-repositório)
- [Roadmap](#%EF%B8%8F-roadmap)

---

## 💡 Sobre

O Order Platform é um mini e-commerce com catálogo, carrinho, checkout e acompanhamento de pedidos. As funcionalidades são simples de propósito: o foco do projeto é a **arquitetura**. É um sistema distribuído pequeno, mas realista, que coloca em prática os padrões usados em plataformas de produção:

- **Microsserviços em três linguagens.** Uma API em TypeScript, um worker em Go e Lambdas em Python, cada um escolhido para o trabalho que faz.
- **Processamento assíncrono.** O checkout responde na hora. A geração da nota fiscal acontece em segundo plano, guiada por filas e eventos.
- **Mensageria confiável.** Transactional outbox, entrega at-least-once, consumidores idempotentes e dead-letter queues.
- **Nove serviços da AWS.** S3, SQS, SNS, Lambda, DynamoDB, SSM Parameter Store, Secrets Manager, IAM e CloudWatch Logs, todos emulados localmente pelo **LocalStack**.
- **Segurança desde o design.** Backend-for-frontend com cookies `httpOnly`, URLs pré-assinadas do S3, controle de acesso por papéis, rate limiting e nenhum segredo em arquivos de ambiente.

> 🧪 **Não precisa de conta na AWS.** Um único comando `docker compose` sobe toda a infraestrutura (filas, buckets, tabelas, Lambdas, parâmetros e segredos) dentro do LocalStack.

---

## 🏗️ Arquitetura em visão geral

```mermaid
flowchart LR
    user(("👤 Usuário"))

    subgraph web["Camada web"]
        fe["<b>Frontend</b><br/>Next.js · BFF"]
    end

    subgraph core["Serviços principais"]
        be["<b>Backend API</b><br/>NestJS · Prisma"]
        pdf["<b>pdf-service</b><br/>Go · worker de fila"]
    end

    subgraph data["Dados"]
        pg[("<b>PostgreSQL</b><br/>users · products<br/>orders · outbox")]
        ddb[("<b>DynamoDB</b><br/>carts · product_cache")]
    end

    subgraph aws["AWS (LocalStack)"]
        s3[("<b>S3</b><br/>imagens · thumbnails<br/>notas fiscais")]
        q1[["<b>SQS</b><br/>orders-queue"]]
        q2[["<b>SQS</b><br/>invoice-ready-queue"]]
        sns{{"<b>SNS</b><br/>order-notifications"}}
        lt["<b>λ image-thumbnail</b><br/>Python · Pillow"]
        ln["<b>λ notify-order</b><br/>Python · psycopg"]
        cfg["<b>SSM + Secrets Manager</b><br/>config · credenciais"]
    end

    user -->|HTTPS| fe
    user -. "PUT/GET pré-assinado" .-> s3
    fe -->|"REST + JWT"| be
    be --> pg
    be --> ddb
    be -->|"order.created"| q1
    be -->|"pré-assina"| s3
    q1 --> pdf
    pdf -->|"PDF da nota"| s3
    pdf -->|"invoice.ready"| q2
    q2 --> ln
    ln -->|"status = READY"| pg
    ln --> sns
    s3 -->|"ObjectCreated"| lt
    lt -->|thumbnail| s3
    cfg -. "carregado no boot" .-> be & pdf & ln
```

| Componente | Responsabilidade | Roda como |
|---|---|---|
| **Frontend** | UI e backend-for-frontend. Guarda o JWT em cookie `httpOnly` e chama a API pelo servidor | Container |
| **Backend API** | Autenticação, catálogo, carrinho, checkout, pedidos, URLs pré-assinadas, transactional outbox | Container |
| **pdf-service** | Consome `order.created`, gera o PDF da nota, salva no S3 e emite `invoice.ready` | Container (worker contínuo) |
| **λ notify-order** | Consome `invoice.ready`, marca o pedido como `READY` e publica no SNS | Lambda (gatilho SQS) |
| **λ image-thumbnail** | Gera uma miniatura de 300 px para cada imagem de produto enviada | Lambda (gatilho S3) |

> Dois estilos de computação lado a lado: um **worker Go persistente**, que usa goroutines para ganhar throughput, e **Lambdas orientadas a eventos** para tarefas pequenas e intermitentes de pós-processamento.

---

## 🧰 Stack de tecnologias

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend | **Next.js 16** (App Router) + TypeScript + Tailwind | Server Components e Server Actions formam um BFF limpo |
| API | **NestJS** + TypeScript + **Prisma** | Estrutura modular, injeção de dependência, guards e acesso a dados tipado |
| Worker | **Go** + [maroto](https://github.com/johnfercher/maroto) | Consumidor de fila leve e concorrente para renderizar PDFs, que usa bastante CPU |
| Serverless | Lambdas em **Python** (Pillow, psycopg) | Handlers de evento pequenos que não precisam de um servidor rodando |
| SQL | **PostgreSQL 16** | Dados transacionais que exigem integridade referencial |
| NoSQL | **DynamoDB** | Acesso chave-valor quente: carrinhos e cache de produtos com TTL |
| Mensageria | **SQS** (+ DLQs) · **SNS** | Desacoplamento, retentativas e notificações fan-out |
| Armazenamento | **S3** | Imagens de produtos, miniaturas e PDFs das notas |
| Config e segredos | **SSM Parameter Store** · **Secrets Manager** | Configuração centralizada, sem segredos no `.env` |
| Infra local | **Docker Compose** + **LocalStack** | A nuvem inteira num notebook |
| Qualidade | Vitest (unit + e2e) · oxlint · ESLint · `go test`/`go vet` · `unittest` | Testes e lint em todos os serviços |

---

## 🔄 Como um pedido flui

### Checkout → nota fiscal → notificação

O checkout **nunca espera** pela nota fiscal. A API responde assim que o pedido é gravado, e o resto acontece de forma assíncrona.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant FE as Frontend (BFF)
    participant API as Backend API
    participant PG as PostgreSQL
    participant Q1 as SQS orders-queue
    participant GO as pdf-service (Go)
    participant S3 as S3
    participant Q2 as SQS invoice-ready-queue
    participant L as λ notify-order
    participant SNS as SNS

    U->>FE: Finaliza o pedido
    FE->>API: POST /orders/checkout
    API->>PG: BEGIN · insere pedido + order.created (outbox) · COMMIT
    API-->>FE: 201 Created (status CREATED)

    loop Dispatcher do outbox (retentativas com backoff)
        API->>Q1: envia order.created
        API->>PG: pedido → PROCESSING
    end

    Q1->>GO: long-poll (N workers concorrentes)
    GO->>S3: grava invoices/{order_id}.pdf
    GO->>Q2: envia invoice.ready
    GO->>Q1: apaga a mensagem (só após sucesso)

    Q2->>L: gatilho (lote)
    L->>PG: BEGIN · pedido → READY + invoice_key
    L->>SNS: publica notificação
    L->>PG: COMMIT

    FE->>API: polling a cada 5 s enquanto CREATED/PROCESSING
    U->>FE: Baixa a nota fiscal
    FE->>API: GET /orders/:id/invoice
    API-->>FE: URL pré-assinada do S3 (5 min)
    FE-->>U: redirect 302 → PDF baixado do S3
```

### Ciclo de vida do pedido

```mermaid
stateDiagram-v2
    direction LR
    [*] --> CREATED: checkout (mesma transação do outbox)
    CREATED --> PROCESSING: evento publicado no SQS
    PROCESSING --> READY: nota gerada (λ notify-order)
    READY --> DELIVERED
    CREATED --> CANCELLED
    PROCESSING --> CANCELLED
    DELIVERED --> [*]
    CANCELLED --> [*]
```

> `CREATED → PROCESSING → READY` é totalmente automatizado. `DELIVERED` e `CANCELLED` já fazem parte do modelo; os fluxos que os usam estão no roadmap.

### Upload de imagem de produto

O bucket é privado. Os bytes do arquivo nunca passam pela API: o navegador fala direto com o S3 usando URLs pré-assinadas de curta duração.

```mermaid
sequenceDiagram
    autonumber
    actor M as Gerente
    participant FE as Frontend
    participant API as Backend API
    participant S3 as S3 (bucket privado)
    participant L as λ image-thumbnail

    M->>FE: Escolhe PNG/JPEG (≤ 5 MB)
    FE->>API: POST /products/:id/image-upload-url
    API-->>FE: PUT pré-assinado (assina tipo + tamanho, 5 min)
    FE->>S3: PUT products/{id}/{uuid}.png
    S3-)L: s3:ObjectCreated
    L->>S3: PUT thumbnails/products/... (JPEG 300 px)
    FE->>API: PUT /products/:id/image
    API->>S3: HEAD + lê os magic bytes (assinatura PNG/JPEG)
    API-->>FE: 200 (ou objeto apagado se rejeitado)
```

### Configuração e segredos

Os serviços nunca leem o `.env`. Recebem só o nome do ambiente e as credenciais de acesso à AWS, carregam todo o resto da AWS ao iniciar e falham na hora se faltar algum valor.

```mermaid
flowchart LR
    boot["localstack/init<br/>01-bootstrap.sh"] -->|"cria"| ssm["SSM Parameter Store<br/>/order-platform/{env}/{shared|service}/..."]
    boot -->|"cria"| sm["Secrets Manager<br/>order-platform/{env}/..."]
    ssm --> be["Backend"] & go["pdf-service"] & lam["Lambdas"]
    sm --> be & lam
```

---

## 🧭 Decisões de arquitetura

| Decisão | Problema que resolve | Trade-off |
|---|---|---|
| **Transactional outbox** (tabela `order_events` + dispatcher) | Evita o problema de dual-write: um pedido nunca é salvo sem o seu evento, e nenhum evento é enviado para um pedido que sofreu rollback | Pequeno atraso até publicar; tabela e dispatcher extras |
| **Entrega at-least-once + consumidores idempotentes** | Mensagens reentregues não causam problema: o worker pula a geração se o PDF já existe, e a Lambda nunca regride o status | Os consumidores precisam ser escritos pensando em idempotência |
| **DLQ por fila** (`maxReceiveCount = 3`, visibilidade de 60 s) | Mensagens problemáticas não travam a fila nem ficam em retentativa infinita | Mensagens na DLQ são investigadas manualmente |
| **Apagar só depois de confirmar o efeito** | Nenhum trabalho se perde se um worker cair no meio | Possíveis duplicatas, tratadas pela idempotência |
| **Falhas parciais de lote** na Lambda | Uma mensagem ruim não faz o lote inteiro ser reprocessado | Contrato do handler mais complexo |
| **Worker Go vs Lambda** | Renderização de PDF longa e pesada em CPU vai para um worker concorrente; handlers pequenos e intermitentes vão para Lambda | Dois modelos de execução para operar |
| **Carrinho no DynamoDB com snapshot de nome/preço** | Operações de carrinho nunca tocam o Postgres; o checkout devolve `409` com o carrinho atualizado se um preço mudou | O snapshot pode ficar desatualizado e é conferido no checkout |
| **Cache de produtos cache-aside com TTL** | Menos leituras no Postgres para produtos muito acessados; falhas do cache caem para o banco | Pequena janela de dado desatualizado (TTL de 5 min) |
| **Backend-for-frontend** | O JWT fica em cookie `httpOnly` e a URL da API só existe no servidor: nenhum token no JS do navegador e nenhum CORS | O servidor do frontend fica no caminho da requisição |
| **URLs pré-assinadas do S3** | Uploads e downloads não passam pela API; o bucket continua privado | O servidor precisa validar o objeto enviado (tamanho, tipo, magic bytes) |
| **SSM + Secrets Manager no lugar do `.env`** | Uma fonte única de verdade por ambiente; na AWS, IAM roles com escopo por prefixo de serviço | Os serviços dependem da AWS estar acessível no boot |
| **Contrato de eventos versionado** ([`docs/events.md`](docs/events.md)) | Produtores e consumidores em linguagens diferentes seguem um envelope explícito (`event`, `version`, `occurred_at`, `data`) | Mudanças de formato exigem nova versão e um período de transição |

---

## 🚀 Como rodar

### Pré-requisitos

- **Docker** com Docker Compose v2 (no Windows, Docker Desktop com integração WSL)
- **make**
- *(opcional)* AWS CLI, para inspecionar os recursos do LocalStack com `make aws-resources`

Não é preciso instalar Node, Go nem Python: tudo é compilado e executado em containers.

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/Lucas-Mol/order-platform-microservice-project.git
cd order-platform-microservice-project

# 2. Crie o arquivo de ambiente local
cp .env.example .env

# 3. Gere os pacotes das Lambdas (o deploy é automático quando o LocalStack sobe)
make lambdas

# 4. Suba a infraestrutura e todos os serviços
docker compose --profile app up -d --build

# 5. Espere o LocalStack terminar de criar os recursos da AWS
docker compose logs -f localstack     # procure "[bootstrap] done" e depois Ctrl+C

# 6. Carregue os produtos de exemplo
docker compose exec backend npm run db:seed
```

Abra **http://localhost:3000** e crie uma conta. 🎉

Para gerenciar o catálogo, promova sua conta (não existem credenciais de admin padrão):

```bash
docker compose exec backend npm run user:set-role -- voce@exemplo.com ADMIN
```

| Serviço | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3333 ([`/health`](http://localhost:3333/health)) |
| pdf-service | http://localhost:8080 ([`/healthz`](http://localhost:8080/healthz)) |
| LocalStack | http://localhost:4566 |
| PostgreSQL | `localhost:5432` |

### Teste o fluxo completo

1. Como **gerente**, acesse `/admin/products`, crie um produto e envie uma foto. Alguns segundos depois aparece a miniatura, gerada por uma Lambda.
2. Como **cliente**, adicione itens ao carrinho. O carrinho fica no DynamoDB.
3. **Finalize o pedido** e abra *Meus pedidos*. Você vai ver o pedido passar por `CREATED → PROCESSING → READY` enquanto o worker Go e a Lambda fazem o trabalho.
4. **Baixe o PDF da nota fiscal** do S3 por uma URL pré-assinada.
5. Rode `make aws-resources` para ver os buckets, filas, tópico, tabelas, Lambdas e parâmetros criados.

---

## 🛠️ Comandos extras

### Targets do Make

Rode `make help` para listar todos.

| Comando | O que faz |
|---|---|
| `make up` | Sobe só a infraestrutura (Postgres + LocalStack) |
| `make up-all` | Sobe a infraestrutura + os serviços da aplicação |
| `make down` | Para tudo, mantendo os volumes |
| `make logs` | Acompanha os logs de todos os serviços |
| `make ps` | Status dos containers |
| `make reset` | ⚠️ Para tudo e **apaga os volumes** (dados do Postgres e do LocalStack) |
| `make aws-resources` | Lista os recursos de S3, SQS, SNS, DynamoDB, Lambda, SSM e Secrets Manager (os valores dos segredos nunca são exibidos) |
| `make lambdas` | Gera cada `lambdas/*/function.zip` e refaz o deploy se o LocalStack estiver rodando |
| `make lambda-test` | Roda os testes unitários da Lambda `notify-order` |
| `make pdf-test` | Roda os testes unitários do `pdf-service` em Go |
| `make pdf-lint` | `gofmt` + `go vet` no `pdf-service` |
| `make pdf-tidy` | Sincroniza `go.mod`/`go.sum` |

### Docker Compose

```bash
docker compose up -d                                        # só infraestrutura
docker compose --profile app up -d                          # tudo
docker compose --profile app up -d --build pdf-service      # rebuild de um único serviço
docker compose --profile app up -d --build -V backend       # rebuild após mudar dependências (-V descarta o volume antigo de node_modules)
docker compose logs -f backend pdf-service                  # logs de serviços específicos
docker compose exec backend npm run db:seed                 # popula produtos de exemplo
docker compose exec backend npm run user:set-role -- <email> <CUSTOMER|MANAGER|ADMIN>
```

### Testes e lint

```bash
# Backend (dentro do container, ou no host em backend/)
docker compose exec backend npm run lint
docker compose exec backend npm test
docker compose exec -e TEST_DATABASE_URL=postgresql://orders:orders@postgres:5432/orders_test backend npm run test:e2e

# Frontend
docker compose exec frontend npm run lint

# Worker Go e Lambdas Python (em containers, sem toolchain local)
make pdf-test pdf-lint lambda-test
```

A suíte e2e cria e migra o banco `*_test` informado, limpa as tabelas entre os testes e recusa qualquer banco cujo nome não termine em `_test`.

<details>
<summary><b>Rodando backend e frontend no host</b></summary>

Recomendado Node 22 e npm 11. A CLI do Prisma nunca lê a URL de um arquivo: os scripts `db:*` montam o `DATABASE_URL` a partir do segredo `database`, só para aquele processo.

```bash
make up   # só infraestrutura

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

`DATABASE_HOST`/`DATABASE_PORT` só são aceitos quando `APP_ENV=local`.

</details>

---

## 📚 Referência

<details>
<summary><b>Rotas da API</b></summary>

| Rota | Acesso | Descrição |
|---|---|---|
| `POST /auth/register`, `POST /auth/login` | — | Cria conta / obtém um bearer token |
| `GET /products`, `GET /products/:id` | — | Catálogo (`?limit=&offset=`, `?q=` busca por nome ou descrição) |
| `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` | `MANAGER` | Gestão do catálogo |
| `POST /products/:id/image-upload-url`, `PUT /products/:id/image`, `DELETE /products/:id/image` | `MANAGER` | Foto do produto: upload pré-assinado, vínculo após validações, remoção |
| `GET /cart`, `POST /cart/items/:productId` (adiciona), `PUT /cart/items/:productId` (define), `DELETE /cart/items/:productId`, `DELETE /cart` | `CUSTOMER` | Carrinho no DynamoDB com snapshot de nome/preço (até 50 produtos, 100 unidades cada) |
| `POST /orders/checkout`, `POST /orders`, `GET /orders`, `GET /orders/:id` | `CUSTOMER` | Checkout do carrinho (`409` e carrinho atualizado se um preço mudou) ou de itens explícitos, e consulta de pedidos restrita ao usuário do token |
| `GET /orders/:id/invoice` | `CUSTOMER` | Download pré-assinado da nota (5 min) quando o pedido está `READY`/`DELIVERED`; `409` antes disso |
| `GET /users/me` | `CUSTOMER` | Usuário atual e papel |
| `GET /users`, `PATCH /users/:id/role` | `ADMIN` | Listagem de usuários e gestão de papéis |
| `GET /health` | — | Verificação do Postgres |

</details>

<details>
<summary><b>Papéis e rate limiting</b></summary>

Os papéis são hierárquicos: cada um inclui as permissões dos que estão abaixo dele.

| Papel | Pode |
|---|---|
| `CUSTOMER` (padrão no cadastro) | Navegar, gerenciar o próprio carrinho, fazer e ver os próprios pedidos |
| `MANAGER` | Tudo acima + criar, editar e excluir produtos |
| `ADMIN` | Tudo acima + listar usuários e alterar seus papéis |

O papel é lido do banco a cada requisição, então promoções e rebaixamentos valem na hora, mesmo para tokens já emitidos. Admins não podem alterar o próprio papel.

O **rate limiting** é por IP do cliente e por rota, em memória (instância única). Os limites vêm do SSM (`rate-limit-ttl-seconds`, `rate-limit-max` e `auth-rate-limit-max` para login/cadastro, aplicado por IP e por e-mail). Requisições acima do limite recebem `429` com o header `Retry-After`, e o `/health` nunca é limitado. O frontend repassa o IP do navegador em `X-Forwarded-For`. O backend só confia nesse header quando ele vem dos proxies listados em `/order-platform/{env}/backend/trusted-proxies`.

</details>

<details>
<summary><b>Organização de configuração e segredos</b></summary>

| Tipo | Onde | Exemplos |
|---|---|---|
| Configuração | SSM Parameter Store, `/order-platform/{env}/{shared\|service}/...` | `/order-platform/local/shared/sqs-orders-queue`, `/order-platform/local/pdf-service/worker-concurrency` |
| Segredos | Secrets Manager, `order-platform/{env}/...` | `order-platform/local/database`, `order-platform/local/backend/jwt-secret` |

- O `localstack/init/01-bootstrap.sh` cria os parâmetros e segredos sempre que o LocalStack sobe. Os valores vêm da seção "bootstrap input" do `.env`, exceto o segredo do JWT, que é gerado aleatoriamente a cada vez (tokens emitidos antes de reiniciar o LocalStack deixam de funcionar).
- O healthcheck do LocalStack só passa depois que o bootstrap termina, então os serviços da aplicação nunca sobem sem a sua configuração.
- Na AWS real, os serviços acessam esses valores por uma IAM role com escopo no próprio prefixo, em vez de chaves estáticas. O LocalStack Community não aplica IAM e guarda os segredos sem criptografia no seu volume. Localmente, a configuração espelha a arquitetura de produção, mas não protege os valores.

</details>

<details>
<summary><b>Contrato de eventos</b></summary>

Todo payload de fila segue um envelope JSON versionado. Veja [`docs/events.md`](docs/events.md) para `order.created`, `invoice.ready`, a notificação SNS e as regras de tratamento de falhas.

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

## 📁 Estrutura do repositório

```
.
├── backend/          # API NestJS: auth, produtos, carrinho (DynamoDB), pedidos + outbox, presign S3
│   ├── prisma/       # schema, migrations, seed
│   └── test/         # suítes e2e (Vitest)
├── frontend/         # BFF Next.js: catálogo, carrinho, checkout, pedidos, admin
├── pdf-service/      # Worker Go: consumidor SQS → PDF (maroto) → S3 → invoice.ready
├── lambdas/
│   ├── image_thumbnail/   # gatilho S3 → miniatura de 300 px (Pillow)
│   └── notify_order/      # gatilho SQS → pedido READY + SNS (psycopg)
├── localstack/init/  # bootstrap: bucket, filas + DLQs, tópico, tabelas, SSM, segredos, Lambdas
├── docs/events.md    # contrato de eventos versionado
├── docker-compose.yml
└── Makefile
```

---

## 🗺️ Roadmap

- [x] **Etapa 0**: Fundação (Docker Compose, bootstrap do LocalStack, SSM + Secrets Manager)
- [x] **Etapa 1**: Backend + PostgreSQL (JWT, papéis, catálogo, pedidos, rate limiting)
- [x] **Etapa 2**: Frontend web (BFF, catálogo, carrinho, checkout, acompanhamento de pedidos, admin)
- [x] **Etapa 3**: Upload pré-assinado no S3 + Lambda `image-thumbnail`
- [x] **Etapa 4**: Transactional outbox + `orders-queue` + serviço de PDF em Go
- [x] **Etapa 5**: Lambda `notify-order` + SNS + download da nota fiscal
- [x] **Etapa 6**: Carrinho e cache de produtos no DynamoDB
- [ ] **Etapa 7**: Containerização final e fechamento do MVP

**Próximas ideias:** IaC (Terraform/CDK) para deploy real na AWS · observabilidade (logs estruturados, métricas, tracing) · relatórios sob demanda no serviço Go · integração com gateway de pagamento · refresh token / OAuth · testes de carga no pipeline de filas.

---

<div align="center">

Feito por **[Lucas Mol](https://github.com/Lucas-Mol)** como estudo prático de sistemas distribuídos e arquitetura de software.

⭐ Se este projeto te ajudou ou te interessou, considere deixar uma estrela!

</div>
