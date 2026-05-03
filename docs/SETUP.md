# Setup Guide

## Prerequisites

| Requirement | Details |
|-------------|---------|
| n8n instance | Self-hosted (recommended) or n8n cloud |
| Server | Oracle Cloud Free Tier VPS or any Linux server |
| Telegram Bot | Create via [@BotFather](https://t.me/BotFather) on Telegram |
| Claude API key | [console.anthropic.com](https://console.anthropic.com) |
| RapidAPI key | [rapidapi.com](https://rapidapi.com) — JSearch API (for job alerts) |
| Google OAuth | For Gmail + Calendar workflows |

---

## Step 1 — Set Up n8n on Oracle Cloud (Free Tier)

Oracle Cloud offers a permanently free VPS (4 CPU, 24GB RAM on ARM) — more than enough for this system.

```bash
# Install Docker
sudo apt update && sudo apt install -y docker.io docker-compose

# Run n8n
docker run -d \
  --name n8n \
  --restart always \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

Access n8n at `http://YOUR_SERVER_IP:5678`

---

## Step 2 — Create Your Telegram Bot

1. Open Telegram → search for `@BotFather`
2. Send `/newbot` → follow prompts
3. Copy the **Bot Token**
4. Get your Chat ID: message `@userinfobot` on Telegram

---

## Step 3 — Import Workflows

1. Open your n8n instance
2. Go to **Workflows → Import from file**
3. Upload any `.json` file from the `workflows/` folder
4. Replace all placeholder values:
   - `YOUR_RAPIDAPI_KEY_HERE` → your RapidAPI key
   - `YOUR_TELEGRAM_CHAT_ID` → your Telegram chat ID
   - `YOUR_CLAUDE_API_KEY` → your Anthropic API key
5. Add credentials in n8n (Telegram Bot Token, Google OAuth, etc.)
6. **Activate** the workflow

---

## Step 4 — Configure Credentials in n8n

### Telegram
- Go to **Credentials → New → Telegram API**
- Paste your Bot Token

### Claude API (Anthropic)
- Go to **Credentials → New → HTTP Header Auth**
- Header name: `x-api-key`
- Header value: your Claude API key

### Google (Gmail + Calendar)
- Go to **Credentials → New → Google OAuth2**
- Follow the OAuth flow with your Google account

---

## Workflow Overview

| Workflow | Trigger | Frequency |
|----------|---------|-----------|
| SAP Job Alert | Schedule | Every hour |
| Email Triage | Gmail Trigger | Every 5 min |
| Finance Briefing | Schedule | Daily 8 AM |
| On-Demand Assistant | Telegram message | Real-time |

---

## Security Notes

- **Never commit API keys** — use n8n's built-in credential manager
- All credentials in this repo use placeholder values only
- The `.gitignore` excludes `.env` files and any secrets
