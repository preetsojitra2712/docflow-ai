# DocFlow AI

DocFlow AI is an early-stage, production-oriented backend system for document ingestion, storage, processing, and audited decision-making.

The project focuses on building a **correct, secure, and extensible backend foundation** before layering on advanced features such as search, AI reasoning, and user-facing interfaces.

This repository reflects active development toward a scalable, real-world document processing platform.

---

## Project Status

🚧 **Actively under development**

The system is functional and demoable but intentionally minimal.  
The priority at this stage is **architecture, correctness, and observability**, not UI polish.

---

## What Is Implemented (Current MVP)

The backend currently supports:

### Authentication & Security
- JWT-based authentication
- Secure refresh-token sessions with rotation
- Session management and revocation
- CSRF protection for sensitive endpoints
- Admin-only access control for audits

### Document Lifecycle
- Upload documents via API
- Store files in S3-compatible object storage (MinIO)
- Store metadata in PostgreSQL via Prisma
- List documents owned by a user
- Download documents via secure, time-limited presigned URLs
- Delete documents

### Agentic Processing (MVP)
- Background document processing using Temporal workflows
- Text extraction (currently `.txt`, minimal PDF support planned)
- Rule-based agent decision making (routing documents into categories):
  - `FINANCE`
  - `HR`
  - `LEGAL`
  - `SUPPORT`
  - `OTHER`
- Automatic task creation with:
  - category
  - confidence score
  - reasoning
- Persistent storage of:
  - extracted content
  - agent decision output

### Auditing & Observability
- Full audit trail for:
  - uploads
  - agent decisions
  - task creation
  - document access
- Admin-accessible audit log endpoint
- Document-scoped audit inspection

All critical actions are recorded for traceability and debugging.

---

## Tech Stack

### Backend
- Node.js (20+)
- TypeScript
- Fastify

### Database
- PostgreSQL
- Prisma ORM (with migrations)

### Object Storage
- MinIO (S3-compatible)

### Workflow & Background Processing
- Temporal (server + worker)

### Infrastructure & Tooling
- Docker & Docker Compose
- pnpm workspaces (monorepo)
- WSL (Ubuntu) for development
- curl and PowerShell for API testing

---

## High-Level Architecture

- Clients authenticate and interact with a Fastify API
- Files are uploaded and stored in MinIO
- Metadata, extracted content, decisions, and tasks are stored in PostgreSQL
- Temporal workflows coordinate background processing
- Workers execute extraction and agent logic
- All actions are audited for traceability

This mirrors patterns commonly used in production backend systems.

---

## Monorepo Structure

```text
docflow-ai/
├── apps/
│   ├── api/        # Fastify API service
│   └── worker/     # Temporal worker (agentic processing)
├── packages/
│   └── db/         # Prisma schema, migrations, DB utilities
├── infra/          # Infrastructure-related files
├── scripts/        # Local utility scripts
├── docker-compose.yml
├── prisma.config.ts
├── pnpm-workspace.yaml
└── README.md

```

---

## Local Development Setup

### Requirements

* Node.js 20+
* pnpm
* Docker

### Setup Steps

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @docflow/db exec prisma migrate dev
pnpm --filter @docflow/api dev
pnpm --filter @docflow/worker dev

```

The API will be available at:
`http://localhost:4000`

Temporal UI:
`http://localhost:8081`

---

## Environment Variables

Example `.env`:

```env
DATABASE_URL=postgresql://docflow:docflow@localhost:5432/docflow

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio12345
MINIO_BUCKET=docflow
MINIO_USE_SSL=false

JWT_SECRET=dev-secret-change-me
COOKIE_SECRET=dev-cookie-secret-change-me

PORT=4000
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_TASK_QUEUE=docflow

```

---

## API Endpoints

### Health Check

`GET /health`

---

### Upload Document

`POST /upload`

Multipart form field: `file`

---

### List Documents

`GET /documents`

Returns only documents owned by the authenticated user.

---

### Get Document Metadata

`GET /documents/:id`

---

### Document Status

`GET /documents/:id/status`

---

### Agentic Result (Extraction + Decision + Task)

`GET /documents/:id/result`

---

### Task Details

`GET /documents/:id/task`

---

### Document Audit Trail

`GET /documents/:id/audit`

---

### Download Document

`GET /documents/:id/download`

Returns a secure presigned URL.

---

### Admin Audit Logs

`GET /admin/audit`

Admin-only endpoint showing system-wide activity.

---

## Example Upload (PowerShell)

```powershell
curl.exe -X POST "http://localhost:4000/upload" `
  -H "Authorization: Bearer <ACCESS_TOKEN>" `
  -F "file=@C:\path\to\file.txt"

```

---

## Design Philosophy

* Build a strong backend core first
* Favor correctness over premature optimization
* Use production-grade tools from day one
* Keep infrastructure reproducible locally
* Make every action observable and auditable
* Design for future AI-driven workflows

---

## Planned Next Steps

* PDF text extraction improvements
* Retry processing for failed documents
* Search and indexing
* Advanced agent reasoning (LLM-based)
* Per-user rate limiting
* Email verification and password reset
* Frontend UI
* Production deployment configuration

---

## Disclaimer

This repository reflects early-stage development.
Breaking changes are expected as the system evolves.

---

## Author

**Preet Sojitra** Backend, Systems, and AI-focused Engineer
