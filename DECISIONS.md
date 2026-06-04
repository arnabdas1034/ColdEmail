Date: 2026-06-02
Project: Project 3 — Cold Email Campaign Manager
Decision: Build path 1.5 — personal tool with product hooks
Why: Dominant goal is freelance income, so future commercialization is 
plausible. Building with auth provider + userId column + cloud APIs from 
day 1 keeps the door open for multi-tenant later, at zero extra cost now.
Alternative rejected: (a) Pure personal tool — would need rewrite to 
commercialize. (b) Full product mode — 6-9 months, high abandon risk for 
a 3rd-year student.
What I learned: "Build for today, design for tomorrow." Cheap hooks now 
(env vars, userId, cloud storage) prevent expensive rewrites later.

Date: 2026-06-02
Project: Project 3 — Cold Email Manager
Decision: TypeScript + Next.js full-stack (not Python split-stack)
Why: App is a web app; Next.js is purpose-built. One language = depth not 
context-switching. Vercel Cron (needed for drip jobs) is native. Biggest 
documented ecosystem = fewest dead-ends.
Alternative rejected: Python FastAPI + React — two languages, two deploys, 
background jobs need separate Celery setup.
What I learned: Pick the stack that fits the PROBLEM SHAPE (web app → web 
framework), not the language you already know. TS is the "+1 new skill" 
this project teaches.

Date: 2026-06-02
Decision: Background jobs via Vercel Cron + a Postgres "jobs" table 
(not a full queue+worker, not plain cron)
Why: My scale (40/day) doesn't need a real queue. But a DB-backed job 
table teaches queue CONCEPTS (pending/sent/failed states, retries, 
idempotency) without operational complexity of a queue service.
Alternative rejected: (a) Plain cron — too little learning. (b) Full 
queue+worker (BullMQ/Redis) — overkill, +4 days, more to break.
What I learned: "Poor man's queue" — a DB table + scheduled cron is a 
legitimate production pattern at small scale. Reach for real queues only 
when scale demands it.

Date: 2026-06-02
Decision: Resend for email + self-built Level 1 reply-matching
Why: Best docs (fewest dead-ends when stuck), inbound webhooks since Nov 
2025, generous free tier. Reply-matching by sender email = ~15 lines, 
~90% reliable, good learning + FAANG signal.
Alternative rejected: AgentMail — handles threading for me, but less 
learning, smaller docs. Valid choice, just less educational.
What I learned: When choosing a tool, weigh "what will I build myself?" 
Sometimes the tool that makes you build a bit more teaches more. Verified 
the inbound feature via live search before committing — don't trust 
AI's memory on current product features.

Date: 2026-06-02
Project: Project 3 — Cold Email Manager
Decision: emails table doubles as the job queue (no separate jobs table)
Why: emails already needs status + scheduled_for columns. A cron query 
(WHERE status='scheduled' AND scheduled_for<=now()) turns it into a queue. 
Fewer tables = simpler model.
Alternative rejected: Separate jobs table — redundant, the emails table 
already holds all needed fields.
What I learned: Before creating a new table, check if an existing one can 
serve the role. Reuse beats proliferation.

Date: 2026-06-02
Decision: Separate emails table from leads (one lead → many emails)
Why: A lead receives initial + follow-up1 + follow-up2. Each needs its 
own schedule, status, and content. Can't model that as one column on leads.
Alternative rejected: email fields on leads table — breaks the moment a 
follow-up is needed.
What I learned: "One X has many Y" = Y needs its own table with a foreign 
key to X. Core relational modeling.

Date: 2026-06-02
Decision: events table is append-only; leads.status is denormalized
Why: events = full immutable history (audit trail, never lose what 
happened). leads.status = a fast-read summary so the dashboard doesn't 
recompute from events every load.
Alternative rejected: Deriving status from events on every read — slower 
dashboard. Or no events log — lose history.
What I learned: Denormalization (storing a summary alongside the source 
of truth) is a deliberate speed tradeoff, not redundancy. Senior pattern.

Date: 2026-06-02
Project: Project 3 — Cold Email Manager
Decision: Use Tailwind CSS (overrode AG's --no-tailwind suggestion)
Why: Phase 6 UI generators (Stitch/v0) output Tailwind by default. 
Starting vanilla CSS now = painful conversion when feeding generated UI 
in later. Tailwind is the Next.js standard. Decide styling now, not 
mid-build.
Alternative rejected: Vanilla CSS — teaches CSS fundamentals deeper, but 
goal is ship + Phase 6 tools speak Tailwind. Learning depth lost here is 
acceptable given the goal.
What I learned: AI optimizes the current task; I optimize the whole 
project. AG didn't know my Phase 6 UI plan, so it made a locally-sensible 
but project-wrong call. The human holds cross-phase context.

