# DocFlow AI

Hello 👋  
I am currently working on this project.

DocFlow AI is an **early-stage, startup-level backend system** designed for document ingestion, storage, and retrieval.  
This repository represents my **initial commits**, where the core backend architecture and infrastructure are being built from scratch with production-readiness in mind.

The long-term goal of DocFlow AI is to become a scalable document platform that can later support authentication, background processing, search, and AI-powered document understanding.

---

## Project Status

🚧 **Actively under development**

This repository currently focuses on building a **strong backend foundation** rather than a finished product.

What is implemented so far:

- End-to-end file upload pipeline
- Object storage using MinIO (S3-compatible)
- Metadata persistence in PostgreSQL
- Prisma ORM with migrations
- Secure, time-limited download URLs
- Dockerized local infrastructure
- Monorepo setup using pnpm workspaces

These initial commits establish the base architecture on top of which future features will be added.

---

## Tech Stack

### Backend
- Node.js (Fastify)
- TypeScript
- Prisma ORM

### Database
- PostgreSQL

### Object Storage
- MinIO (S3-compatible)

### Infrastructure & Tooling
- Docker & Docker Compose
- pnpm workspaces (monorepo)
- WSL (Ubuntu) development environment
- curl / PowerShell for API testing

---

## High-Level Architecture

1. Clients upload documents via a Fastify API.
2. Files are stored in MinIO object storage.
3. Document metadata is stored in PostgreSQL.
4. Documents can be listed and retrieved via API.
5. Secure, presigned URLs are generated for downloads.
6. All services run locally using Docker for development.

This mirrors real-world production architectures used in backend-heavy systems.

---

## Monorepo Structure

docflow-ai/
├── apps/
│ └── api/ # Fastify API service
├── packages/
│ └── db/ # Prisma schema, migrations, DB utilities
├── infra/ # Infrastructure-related files
├── scripts/ # Local utility scripts
├── docker-compose.yml # Postgres + MinIO
├── prisma.config.ts
├── pnpm-workspace.yaml
└── README.md

yaml
Copy code

---

## Local Development Setup

### Requirements
- Node.js 20+
- pnpm
- Docker

### Setup Steps

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @docflow/db exec prisma migrate dev
pnpm --filter @docflow/api dev
The API will be available at:

arduino
Copy code
http://localhost:4000
Environment Variables
Example configuration (see .env.example):

ini
Copy code
DATABASE_URL=postgresql://docflow:docflow@localhost:5432/docflow
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio12345
MINIO_BUCKET=docflow
MINIO_USE_SSL=false
API_PORT=4000
API Endpoints
Health Check
bash
Copy code
GET /health
Upload Document
bash
Copy code
POST /upload
Multipart form field name:

csharp
Copy code
file
List Documents
bash
Copy code
GET /documents
Get Document Metadata
bash
Copy code
GET /documents/:id
Download Document
bash
Copy code
GET /documents/:id/download
Returns a presigned MinIO URL valid for a limited time.

Example Upload (PowerShell)
powershell
Copy code
curl.exe -F "file=@C:\path\to\file.pdf" http://localhost:4000/upload
Design Philosophy
Start with a solid backend core

Use production-grade tools from day one

Keep infrastructure reproducible locally

Build incrementally with clear boundaries

Optimize for scalability and extensibility

Planned Next Steps
Delete / cleanup endpoints

Authentication and authorization (JWT)

Background processing (e.g. Temporal / queues)

Document text extraction and indexing

Semantic search and AI-powered workflows

Frontend UI for uploads and browsing

Disclaimer
This repository reflects early-stage development and initial commits.
Breaking changes are expected as the system evolves.

Author
Preet Sojitra
Backend / Systems / AI-focused Engineer

