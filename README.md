# AI Personal Automation System

> A fully autonomous AI-powered assistant running 24/7 on Oracle Cloud — built with n8n, Claude API, and 10+ live integrations.

---

## Overview

This is a production automation system I designed and deployed from scratch. It processes natural language requests via Telegram and runs scheduled workflows autonomously — no manual intervention required.

**Stack:** n8n · Claude API (Anthropic) · Oracle Cloud VPS · Telegram Bot API · REST APIs

---

## Architecture

```
Telegram Bot (input)
       │
       ▼
  n8n Orchestration Layer  (Oracle Cloud VPS — 24/7)
       │
       ├── Claude API  ──────────────────  Natural language processing
       │
       ├── Finance APIs ─────────────────  Gold, stocks, currency (live)
       │
       ├── Weather API ──────────────────  Location-based forecasts
       │
       ├── Google Calendar API ──────────  Schedule management
       │
       ├── Gmail API ────────────────────  Intelligent email triage
       │
       ├── Job Search API ───────────────  SAP role alerts + H1B filtering
       │
       ├── USCIS / Immigration API ──────  Case status tracking
       │
       └── News API ─────────────────────  Daily briefings
               │
               ▼
       Telegram Bot (output — formatted alerts)
```

---

## Workflows

### 1. SAP Job Alert — 24/7 (`workflows/sap_job_alert.json`)
Runs every hour. Searches 3 role categories across JSearch API (aggregates LinkedIn, Indeed, Glassdoor, ZipRecruiter), filters for H1B-friendly companies and keywords, deduplicates across runs using n8n static data, and sends formatted Telegram alerts for new matches only.

**Key features:**
- 3 parallel job searches merged into a single pipeline
- H1B sponsor company list (Infosys, TCS, Wipro, Cognizant, Deloitte, Accenture, IBM, etc.)
- Keyword-based filtering: `h1b`, `visa sponsor`, `will sponsor`, `sponsorship`, `opt accepted`
- Cross-run deduplication (persists up to 3,000 seen job IDs)
- Graceful error handling — workflow continues if one search fails

**How to import:**
1. Open your n8n instance
2. Go to Workflows → Import
3. Upload `workflows/sap_job_alert.json`
4. Replace `YOUR_RAPIDAPI_KEY_HERE` with your [JSearch API key](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)
5. Replace `YOUR_TELEGRAM_CHAT_ID` with your Telegram chat ID
6. Add your Telegram Bot credentials
7. Activate the workflow

---

### 2. Email Triage Automation
Monitors Gmail continuously. Classifies incoming emails using Claude API:
- **Urgent** (USCIS notices, job offers, banking alerts) → instant Telegram notification
- **Promotional / newsletters** → silently filtered
- Result: ~80% reduction in inbox noise

---

### 3. Daily Finance Briefing
Scheduled morning workflow. Fetches live gold prices, USD/INR rate, and top stock indices. Formats a clean summary and delivers to Telegram every morning.

---

### 4. On-Demand AI Assistant
Telegram command triggers Claude API with context from connected data sources. Returns natural language answers for questions like "What's my schedule today?" or "What's the gold price right now?"

---

## Setup Requirements

| Tool | Purpose |
|------|---------|
| n8n (self-hosted or cloud) | Workflow orchestration |
| Oracle Cloud VPS (or any server) | 24/7 hosting |
| Telegram Bot Token | Input/output interface |
| Anthropic Claude API key | Natural language processing |
| RapidAPI key (JSearch) | Job search aggregation |
| Google OAuth credentials | Calendar + Gmail access |

---

## About

Built by [Harsha Yelamati](https://linkedin.com/in/harshayelamati) — SAP Technical Consultant and Automation Engineer.

This system demonstrates end-to-end automation lifecycle ownership: architecture design, API integration, cloud deployment, and autonomous operation.
