# SPEC.md — Cold Email Campaign Manager (v1)

## What it is
Personal full-stack web app to run cold email campaigns for freelance 
lead-gen outreach. Single user (me). Built with product hooks for 
possible future multi-tenant expansion.

## Success metric
A campaign of ~50 leads sends + follows up + tracks replies fully 
autonomously, without manual babysitting.

## Core loop
import leads → write template → AI personalizes → review/edit/refine → 
approve → drip-send (daily limits) → track opens/replies → 
auto follow-up if no reply → stop on reply

## v1 Features
1. Auth (single user; product hook for multi-tenant later)
2. Lead import via CSV (name, email, company, role)
3. Email template editor with {variables}
4. AI personalization (Claude rewrites opener per lead)
5. Review + edit + prompt-tune + approve (regenerate all or selected)
6. Drip scheduler + sender (30-40/day, spread over hours, multi-day)
7. Tracking dashboard (replies via webhook = reliable; opens = approximate)
8. Follow-up engine (auto follow-up if no reply; stop on reply)

## Send strategy
- Channel: email only
- Daily limit: 30-40 emails/day (configurable, conservative default)
- Pattern: drip (spread over hours, human-like)
- Campaign: multi-day (e.g., 200 leads @ 40/day over 5 days)

## Reply detection
Webhook from Resend (inbound). Level 1 matching: reply sender email → 
leads table. No inbox sync.

## Out of scope (v2 / BACKLOG)
Multi-channel (LinkedIn/voice), multi-tenant accounts, AI prospect 
research agent, mobile app, client-facing CRM, payments, browser 
extension, IMAP inbox sync.

## Committed risk-avoidances
1. No raw SMTP — use Resend API for deliverability
2. Not competing with Instantly feature-for-feature (personal tool; niche 
   product only if commercialized later)
3. Scope creep → BACKLOG.md, never into v1
4. No autonomous agents — human controls who/when, AI only writes copy

## Stack
- Frontend+Backend: Next.js (App Router), TypeScript
- Database: Supabase (Postgres)
- Auth: Supabase Auth
- Email: Resend (+ Level 1 reply-matching)
- AI: Anthropic Claude
- Background jobs: Vercel Cron + emails table as queue
- Hosting: Vercel
- CSV: parsed in-memory

## Constraints
- Time: 6 hrs/day weekdays, flexible deadline (quality > speed)
- Budget: ₹0 (YC deals: Supabase, Anthropic, Resend, Vercel)
- Tier: FAANG-tier execution