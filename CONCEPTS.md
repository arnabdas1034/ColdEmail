Concept: Personal tool vs product (the scope dragon)
Plain English: A personal tool and a commercial product can look 
identical but the product is 8-12x the work (auth, payments, legal, 
support, marketing, multi-tenancy). Don't confuse "I could sell this" 
with "I should build it as a product now."
When I'd use it: Any time I think "why not make this a product?" — first 
ask: am I its #1 user yet? Dogfood before commercializing.

Concept: Right success metric
Plain English: A success metric should measure what YOUR system controls, 
not what humans/market do. "1 reply landed" depends on copy + list + luck. 
"Campaign runs autonomously" measures the app. Pick the engineering metric.
When I'd use it: Defining "done" for any project. In Phase 0, before building.

Concept: Webhook
Plain English: A way for an external service to auto-notify your app when 
an event happens. You give the service a URL; it sends a message there 
when the event fires (e.g., email replied). Opposite of your app 
constantly asking "did it happen yet?" — the service tells you.
When I'd use it: Any time you need real-time notification from an external 
service (payment succeeded, email replied, file uploaded) without polling.

Concept: Drip vs burst sending
Plain English: Drip = spread sends over hours with gaps (mimics a human, 
lands in inbox). Burst = all at once (looks like a bot, lands in spam). 
Drip wins on deliverability because spam filters reward human-like 
patterns. Evidence: every commercial tool defaults to drip.
When I'd use it: Any high-volume sending (email, notifications, API calls 
to rate-limited services). Spread it out.

Concept: Reliable vs approximate signals
Plain English: Not all tracked data is equally trustworthy. Email replies 
= reliable (a real event). Email opens = approximate (privacy tools block 
the tracking pixel). Know which signals to trust before building logic on 
them.
When I'd use it: Any analytics/tracking feature. Ask "is this signal 
reliable or approximate?" before making decisions based on it.
Add to CONCEPTS.md:

Concept: Reply-matching (Level 1)
Plain English: When a cold-email reply arrives via webhook, match it to 
a lead by the sender's email address (look up leads table). ~90% reliable 
for B2B. Levels 2 (tracking ID) and 3 (Message-ID headers) are more 
robust upgrades for later.
When I'd use it: Any inbound-email feature where you must link a reply 
back to a sent message.

Concept: Database-backed job queue ("poor man's queue")
Plain English: Instead of a dedicated queue service, use a Postgres table 
with rows = jobs (with send_at time + status). A scheduled cron checks 
the table and processes due jobs. Teaches queue concepts (states, retry, 
idempotency) at small scale without operational overhead.
When I'd use it: Scheduled/deferred work at small-to-medium scale before 
real queue infrastructure is justified.

Concept: Append-only event log
Plain English: A table where you only ADD rows, never edit/delete. Each 
row = one thing that happened (sent, opened, replied). Gives you full 
history + audit trail + debuggability.
When I'd use it: Tracking, analytics, anything where "what happened and 
when" matters. Payments, user actions, email events.

Concept: Denormalization
Plain English: Deliberately storing duplicate/summary data for speed. 
E.g., leads.status duplicates info derivable from events, but reading it 
directly is faster than recomputing. Trade storage + write-complexity for 
read-speed.
When I'd use it: When a value is read far more often than written, and 
recomputing it each read is slow. Dashboards, counters, status summaries.

Concept: One-to-many modeling
Plain English: "One campaign has many leads" → leads table gets a 
campaign_id foreign key. "One lead has many emails" → emails table gets a 
lead_id. The "many" side always holds the foreign key.
When I'd use it: Every relational schema. Identify "one X has many Y", put 
the FK on Y.

Concept: .gitignore before first commit
Plain English: Always create .gitignore BEFORE your first git commit. It 
tells git what to NEVER track — secrets (.env), junk (node_modules), 
build files. If you commit before it exists, secrets can leak into git 
history and are painful to fully remove. Single most common beginner 
disaster (leaked API keys on public GitHub).
When I'd use it: Every new repo, first thing, before any commit.

Concept: Git commit
Plain English: A permanent labeled snapshot of your entire project at 
one moment. Like a save-slot in a game — you can go back to any commit 
if something breaks. Every commit has a message describing what changed.
When I'd use it: After every working slice. Small commits = easy rollback. 
"feat: add lead import CSV parsing" is a good commit message.

Concept: .env.example vs .env
Plain English: .env.example = a committed template with placeholder 
values (documents what keys the project needs). .env = your real secret 
keys, never committed. You create .env by copying .env.example 
(cp .env.example .env) then filling in real values.
When I'd use it: Every project with secrets. The .example file lets a new 
developer (or future you) know exactly what env vars to set up.

Concept: Commit small and often
Plain English: Make a git commit at every clean, working stopping point 
(one per task/feature/fix) — NOT one giant commit at the end. Each commit 
is a save point you can roll back to + a backup on GitHub. End-only 
commits = no rollback, no history, lost-work risk, bad FAANG signal.
When I'd use it: Every working chunk. "Does it work now? → commit." 
Rule of thumb: if you'd be sad to lose the last hour's work, commit it.

Concept: Use LTS, not latest
Plain English: Newest runtime/tool version = you discover its bugs (Node 24 
hung our linter). LTS = stable, others already fixed the bugs. Default to LTS 
for real projects.

Concept: Dev/prod parity
Plain English: Your local environment should match production (same Node 
version, same env vars). Mismatch = "works on my machine, breaks on deploy" 
bugs.

Concept: Hard bounce vs soft bounce (suppress only the permanent one)
Plain English: A hard/permanent bounce means the address is dead and will never accept mail — suppress it forever (re-sending wrecks sender reputation). A soft/transient bounce is temporary (mailbox full, server busy) and may succeed later — do NOT suppress. Resend signals this at bounce.type: 'Permanent'=hard, 'Transient'=soft, 'Undetermined'=unknown. Resend mostly emits email.bounced only for permanent failures (soft ones come as email.delivery_delayed and auto-retry).
When I'd use it: Any send system with a suppression list. Gate suppression on the permanent signal; never blacklist a recoverable address.

Concept: Suppression list sources
Plain English: A do-not-send list must be FED to be useful. Three feeders: inbound unsubscribe replies, spam complaints (always), and permanent bounces (soft bounces don't count). The send-path guard reads this list before every send. Build the guard and the feeders together, or the guard checks an empty list.
When I'd use it: Any outbound email system that must respect opt-outs and protect deliverability.