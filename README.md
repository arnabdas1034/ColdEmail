# ColdEmail — Personal Cold Email Campaign Manager

A full-stack web app to run cold email campaigns for freelance lead-gen outreach.  
Single-user, FAANG-tier execution quality, built with product hooks for possible future multi-tenant expansion.

## Stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js 14 (App Router) + TypeScript |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Email | Resend (delivery + inbound webhooks) |
| AI | Anthropic Claude (personalization) |
| Background jobs | Vercel Cron + Postgres queue (`emails` table) |
| Hosting | Vercel |

## Core Loop

```
import leads → write template → AI personalizes → review/approve
→ drip-send (30-40/day) → track opens/replies → auto follow-up → stop on reply
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev
# → http://localhost:3000

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

## Environment Setup

Copy `.env.example` to `.env` and fill in your real keys:

```bash
cp .env.example .env
```

> ⚠️ Never commit `.env`. It is gitignored. Only `.env.example` (with placeholder values) lives in the repo.

## Project Docs

| File | Purpose |
|---|---|
| [SPEC.md](./SPEC.md) | Product specification and feature scope |
| [SCHEMA.md](./SCHEMA.md) | Database design (5-table schema) |
| [DECISIONS.md](./DECISIONS.md) | Architecture decision records (ADRs) |

## Status

> 🚧 In active development — Phase 4 (Skeleton & Environment)
