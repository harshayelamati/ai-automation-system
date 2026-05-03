# System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT LAYER                              │
│                                                             │
│   Telegram Bot  ──────────────────  On-demand queries       │
│   Schedule Triggers  ─────────────  Hourly / Daily jobs     │
│   Gmail Trigger  ─────────────────  Real-time email monitor │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              ORCHESTRATION LAYER (n8n)                      │
│                   Oracle Cloud VPS                          │
│                   Runs 24/7                                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Workflow Engine                                    │   │
│   │  • Route by intent / trigger type                  │   │
│   │  • Parallel API calls                              │   │
│   │  • Merge + deduplicate data                        │   │
│   │  • Error handling (continueRegularOutput)          │   │
│   │  • Static data persistence (cross-run memory)      │   │
│   └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────────┐
          │              │                  │
          ▼              ▼                  ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Claude API  │  │  Live APIs   │  │  Google APIs     │
│             │  │              │  │                  │
│ • Classify  │  │ • JSearch    │  │ • Gmail          │
│   emails    │  │ • Finance    │  │ • Calendar       │
│ • Generate  │  │ • Weather    │  │                  │
│   responses │  │ • News       │  └──────────────────┘
│ • Summarize │  │ • USCIS      │
└─────────────┘  └──────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   OUTPUT LAYER                              │
│                                                             │
│   Telegram Bot  ──  Formatted alerts, answers, briefings   │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### Why n8n?
- Visual workflow builder — fast iteration
- 400+ built-in integrations
- Self-hostable — full data control, no per-execution pricing
- Static data storage for cross-run state (deduplication)

### Why Oracle Cloud Free Tier?
- Permanently free ARM VPS (4 CPU, 24GB RAM)
- Enough to run n8n + all workflows 24/7 at zero cost
- Full control over the server environment

### Why Telegram Bot?
- Instant push notifications (no polling by user)
- Works on all devices with no separate app needed
- Simple API for both sending and receiving messages
- Markdown formatting support for clean output

### Why Claude API for classification?
- Superior natural language understanding vs rule-based filters
- Single API call replaces complex conditional logic trees
- Handles edge cases and ambiguous email subjects gracefully

---

## Deduplication Strategy (Job Alert Workflow)

The job alert workflow uses n8n's `$getWorkflowStaticData('global')` to persist seen job IDs across runs:

```javascript
const staticData = $getWorkflowStaticData('global');
if (!staticData.seenJobIds) staticData.seenJobIds = [];

// Filter to only unseen jobs
const newJobs = allJobs.filter(job =>
  !staticData.seenJobIds.includes(job.job_id)
);

// Persist (capped at 3000 to prevent memory bloat)
staticData.seenJobIds = [
  ...staticData.seenJobIds,
  ...newJobs.map(j => j.job_id)
].slice(-3000);
```

This ensures each job is alerted exactly once, even across hundreds of hourly runs.
