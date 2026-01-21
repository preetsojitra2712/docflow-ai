DocFlow AI

DocFlow AI is an early-stage backend system for document upload, storage, and secure retrieval.
This project focuses on building a production-quality backend foundation before adding advanced features such as search, background processing, and AI-powered document understanding.

The repository reflects active development and incremental progress toward a scalable document platform.

Project Status

🚧 Actively under development

This repository currently represents the backend core of the system.
The goal at this stage is correctness, security, and clean architecture rather than a finished user product.

What is implemented so far

The system currently supports:

User login with secure session handling

Uploading documents through an API

Storing files in object storage (S3-compatible)

Storing document metadata in a relational database

Listing documents owned by a user

Downloading documents via secure, time-limited URLs

Deleting documents

Admin-only audit logs showing system activity

Fully dockerized local development setup

All critical actions such as login, upload, download, and delete are recorded for traceability.

Tech Stack
Backend

Node.js

Fastify

TypeScript

Database

PostgreSQL

Prisma ORM with migrations

Object Storage

MinIO (S3-compatible)

Infrastructure and Tooling

Docker and Docker Compose

pnpm workspaces (monorepo)

WSL (Ubuntu) for development

curl and PowerShell for API testing

High-Level Architecture

Clients authenticate and interact with a Fastify API.

Uploaded files are stored in MinIO object storage.

Metadata is stored in PostgreSQL using Prisma.

Files are downloaded using secure presigned URLs.

All services run locally via Docker in development.

This mirrors common production architectures used in real backend systems.

Monorepo Structure
docflow-ai/
├── apps/
│   └── api/                # Fastify API service
├── packages/
│   └── db/                 # Prisma schema, migrations, DB utilities
├── infra/                  # Infrastructure related files
├── scripts/                # Local utility scripts
├── docker-compose.yml      # Postgres and MinIO
├── prisma.config.ts
├── pnpm-workspace.yaml
└── README.md

Local Development Setup
Requirements

Node.js 20+

pnpm

Docker

Setup
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @docflow/db exec prisma migrate dev
pnpm --filter @docflow/api dev


The API will be available at:

http://localhost:4000

Environment Variables

Example .env configuration:

DATABASE_URL=postgresql://docflow:docflow@localhost:5432/docflow

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio12345
MINIO_BUCKET=docflow
MINIO_USE_SSL=false

JWT_SECRET=dev-secret-change-me
COOKIE_SECRET=dev-cookie-secret-change-me

API_PORT=4000

API Endpoints
Health Check
GET /health

Upload Document
POST /upload


Multipart form field name:

file

List Documents
GET /documents


Returns only documents owned by the authenticated user.

Get Document Metadata
GET /documents/:id

Download Document
GET /documents/:id/download


Returns a presigned MinIO URL valid for a limited time.

Admin Audit Logs
GET /admin/audit


Admin-only endpoint that returns recent system activity such as logins and document operations.

Example Upload (PowerShell)
curl.exe -X POST "http://localhost:4000/upload" `
  -H "Authorization: Bearer <ACCESS_TOKEN>" `
  -F "file=@C:\path\to\file.pdf"

Design Philosophy

Start with a strong backend core

Use production-grade tools from day one

Keep infrastructure reproducible locally

Build incrementally with clear ownership boundaries

Optimize for scalability and extensibility

Planned Next Steps

Password reset and email verification

Refresh token reuse detection

Per-user rate limiting

Background processing (queues or workers)

Document text extraction and indexing

Search and AI-powered workflows

Frontend UI for uploads and browsing

Production deployment configuration

Disclaimer

This repository reflects early-stage development.
Breaking changes are expected as the system evolves.

Author

Preet Sojitra
Backend, Systems, and AI-focused Engineer
