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

Date: 2026-06-06
Decision: ESLint — dropped eslint-config-next, used typescript-eslint + 
@next/eslint-plugin-next directly
Why: eslint-config-next forces Babel parser (next/dist/compiled/babel/
eslint-parser) which hangs on Node 24. Plugin rules load fine without it.
Result: Next.js rules kept, no hang, no Node downgrade. More modern pipeline.
What I learned: Use LTS (Node 22) not latest (24) for fewer tooling bugs. 
And: a fix with a tradeoff (lost Next rules) → interrogate if avoidable, 
don't accept silent loss.

Date: 2026-06-06
Decision: 3 Supabase clients (browser/server/admin), not 2
Why: App Router runs in browser + server + backend contexts. browser+server 
use publishable key (RLS applies); admin uses secret key (bypasses RLS), 
server-only, for cron+webhooks. Verified both keys auth against live DB.
What I learned: Service-role key = god mode = NEVER NEXT_PUBLIC_, never in 
UI. Connection test before deploy = isolate variables.

Date: 2026-06-07
Decision: Resend idempotency key = email row UUID on every cron send
Why: The claim→send→mark-sent sequence is not atomic. If send succeeds but
the follow-up UPDATE (emails→'sent') fails (DB timeout, deploy restart, etc),
the row stays 'sending', the orphan reaper resets it to 'scheduled', and it
gets resent — a real double-send to a real prospect. Passing the email row id
as idempotency key (`email/<uuid>`) makes any Resend retry a no-op: Resend
returns the original response without sending again. Kills the entire
partial-failure double-send class at the source, at zero extra cost.
Alternative: make claim→send→update a DB transaction. Not possible here —
the send is an external HTTP call; Postgres transactions can't span that.
What I learned: Distributed partial failures (external call succeeds,
local update fails) are the hardest class of bug. The correct fix is
idempotency at the external service, not retry logic on our side.

Date: 2026-06-07
Decision: Drive the drip cron from GitHub Actions, not vercel.json crons
Why: The Vercel Hobby plan only allows once-per-day cron schedules. The */5
schedule in vercel.json was rejected at deploy-creation time with
"Hobby accounts are limited to daily cron jobs" — which silently failed EVERY
deploy after T6.6 (GitHub pushes and manual deploy hooks alike produced no
deployment record, so it looked like a broken GitHub integration). Removing
the vercel.json cron unblocks deploys; a GitHub Actions scheduled workflow
(.github/workflows/cron-send.yml) hits the CRON_SECRET-protected endpoint
every 5 min instead. Free, preserves the 5-min cadence the intra-day drip
needs. Endpoint auth is unchanged — the trigger source moved, not the guard.
Alternative: upgrade to Vercel Pro (native sub-daily crons). Deferred — no
need to pay at v1 volume.
What I learned: A failing deploy can masquerade as a broken integration.
"No deployment appeared AND nothing is stuck" pointed at validation rejection
at deploy-creation, not a queue/webhook problem — the CLI's explicit error
message is what surfaced the true cause. Read the actual deploy error before
theorizing about webhooks.

Date: 2026-06-10
Decision: Suppression list = standalone `suppressions` table keyed on (user_id, email), not a status on leads
Why: A do-not-send address (unsubscribe/bounce/complaint) frequently has no lead row in the current campaign, so the send guard must check by address independent of any lead. Email stored normalized (lower+trim) with a CHECK enforcing it, so a forgotten normalization throws at write rather than silently creating a suppression the lookup can never match. unique(user_id,email) makes at-least-once webhook writes idempotent and indexes the guard lookup for free.
Alternative rejected: leads.status='unsubscribed' — can't suppress an address with no lead; re-suppression across campaigns gets messy.
What I learned: A compliance guard must key on the thing it protects (the email address), not on a related entity that may not exist.

Date: 2026-06-10
Decision: Populate suppressions from 3 sources — inbound unsubscribe, permanent bounce, spam complaint
Why: A do-not-send guard is only as good as what feeds it. Inbound 'unsubscribe' (subject match) -> reason='unsubscribe'. email.complained -> reason='complaint' (always; complaints are unambiguous and legally must stop sends). email.bounced -> reason='bounce' ONLY when bounce.type='Permanent' (verified vs Resend webhook schema: Permanent=hard/never-deliver, Transient=soft/may-recover, Undetermined=insufficient-info). Transient/Undetermined are NOT suppressed — blacklisting a recoverable address loses a valid lead.
Why unsubscribe does NOT set leads.status='replied': an opt-out is not an engaged reply; counting it inflates reply rate. The send guard stops future sends via the suppression, so follow-ups stop regardless of lead status.
Known gap: inbound match is case-sensitive (~90%); an unsubscribe from a case-mismatched sender logs a warning but isn't suppressed. Same root cause as reply-match; fix is the deferred lower(email) matching upgrade (closes both).
What I learned: Suppress only on truly permanent signals; over- and under-suppression have asymmetric costs, so gate precisely.

