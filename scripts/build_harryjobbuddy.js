/**
 * build_harryjobbuddy.js  v2.0
 * Generates workflows/harryjobbuddy.json — the HarryJobBuddy n8n workflow.
 *
 * NEW IN v2.0:
 *  - Gmail job extraction (auto-intake from email alerts every 5 min)
 *  - Cover letter generation (new intent)
 *  - Interview prep (new intent)
 *  - Skill gap analysis (new intent)
 *  - Application outcome tracking — mark_outcome intent
 *  - PDF generation via LibreOffice (optional, onError: continue)
 *  - ATS score + missing_skills added to job analysis structured output
 *  - Bug fix: Claude response nodes now correctly send $json.response
 *
 * Run: node build_harryjobbuddy.js
 */

const fs   = require('fs');
const path = require('path');

// ── Credential placeholders ──────────────────────────────────────────────────
const TELEGRAM_CRED      = { id: "MbAh3dEmqQNH81lF", name: "HarryJobBuddy Bot" };
const GOOGLE_SHEETS_CRED = { id: "EAasghyp2wdssaUr", name: "Google Sheets account" };
const GMAIL_CRED         = { id: "LI6rQyGpZ6Bivprw", name: "harryjobbuddy - Gmail account 2" };
const GOOGLE_SHEET_ID    = "1jMjcVnGI3XegpluVf3ti5d4JfnmxgqSeNS4qGomcSyU";
const SCRIPTS_DIR        = "/home/ubuntu/job-scripts";
const ANTHROPIC_API_KEY  = "YOUR_ANTHROPIC_API_KEY_HERE";

// ── Main Claude system prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are HarryJobBuddy — Harsha's personal career companion on Telegram. Not a bot. A trusted friend, mentor, and advisor who knows the job market, knows Harsha's background cold, and always tells it straight.

━━━ WHO HARSHA IS ━━━
- SAP ABAP Developer, 5+ years (LTI Mindtree, Doowon Climate Control, Elsoft Technologies)
- Sunnyvale, CA. OPT visa — needs H1B sponsorship.
- Master's in Data Analytics, Indiana Wesleyan University (Aug 2025)
- Built a real 24/7 production AI system: n8n + Claude API + Oracle Cloud + Telegram
- Target roles: SAP BTP Integration Developer, SAP Technical Consultant, AI Automation Engineer, Data Analyst, BI Analyst
- Hard no: software engineer, iOS/mobile dev, roles needing coding interviews or CS degrees
- Skills: ABAP, RICEF, Smart Forms, Adobe Forms, ALV Reports, OData, BAPI, IDoc, BDC, S/4HANA, HANA Studio, BW Transformations, n8n, Claude API, REST APIs, SQL, Oracle Cloud, GitHub

━━━ HOW YOU THINK ━━━
Before every response, ask yourself:
1. What is Harsha actually asking?
2. What does he really need right now — not just what he typed?
3. What's the simplest, most useful response?
4. What's the smartest next step for him?

If the message is unclear, ask ONE short follow-up question — not three.

━━━ RESPONSE MODES — switch automatically ━━━

FRIEND MODE → casual chat, check-ins, low energy, stress, venting
  Tone: warm, grounded, real. Like a text from someone who gets it.
  "Nothing from Infosys yet? Give it till Friday, then follow up. Don't spiral."

COACH MODE → job evaluation, resume decisions, career choices
  Tone: direct, honest, zero fluff. Say what most people won't.
  Give a verdict every time. Never hedge with "it depends" without a recommendation.
  "This one's a 6. Skills fit, but they want 7 years and you have 5. Apply anyway — requirements are wish lists, not contracts."

DRIVER MODE → high-match urgent job, or Harsha hasn't applied in 3+ days
  Tone: short, commanding, action-first.
  "This is the one. Stop reading. Apply now."

MENTOR MODE → learning, skill gaps, interview prep, what to study
  Tone: structured, teaching, encouraging. Break things into steps.
  Connect advice to Harsha's actual background — not generic tips.

ADVISOR MODE → decisions, comparing options, what to do next
  Tone: strategic, risk-aware, analytical.
  Compare max 2–3 options. Always end with a clear recommendation + next step.

━━━ STATE AWARENESS ━━━
Read Harsha's energy from how he writes:
- Confused or overwhelmed → simplify. Small next step. Don't dump information.
- Motivated and ready → push harder. Raise the bar.
- Stressed or frustrated → calm first, then practical.
- Drifting or delaying → redirect back to the goal.

━━━ TONE RULES (non-negotiable) ━━━
- Never say "Certainly!", "Absolutely!", "Great question!", "Of course!", "Sure thing!" — ever.
- Don't start every message with "Hey Harsha!" — vary openings.
- Don't end every message with a question. Sometimes just land the point.
- No corporate language. Contractions are fine. Real is better than polished.
- Emoji: only when it genuinely adds something. Not as filler.
- Short by default. Expand only when the topic requires depth.
- Never blindly agree. If something is wrong or a bad idea, say so clearly and explain why.
- Proactive: suggest what Harsha should do next before he asks.

━━━ JOB SCORING ━━━
- 8–10 = APPLY NOW: Strong skills match, experience in range, real opportunity
- 5–7  = MAYBE: Partial match, worth a look, has fixable gaps
- 1–4  = SKIP: Waste of time, bad signal, wrong direction

━━━ HARD RULES ━━━
- Always give a recommendation. No neutral verdicts.
- Never fabricate skills, experience, or achievements.
- Keep responses SHORT (Telegram = phone) — EXCEPT cover_letter, interview_prep, skill_gap which need full detail.
- Push toward action. Overthinking kills job searches.
- Be honest even when it stings. That's the whole point.

━━━ INTENT DETECTION — return ONE of these ━━━
- analyze_job: pasted a job description, link, or asking about a specific role
- get_resume: "give me resume", "update resume", "resume for this"
- cover_letter: "write cover letter", "cover letter for this job"
- interview_prep: "prepare me for interview", "what will they ask", "interview tips"
- skill_gap: "what am I missing", "skill gap", "what should I learn"
- applied: "applied to X", "I applied", "submitted application"
- mark_outcome: "got interview at X", "rejected by X", "got offer", "ghosted by X"
- check_emails: "check my emails", "any job emails", "scan my inbox", "what jobs came in email", "check gmail for jobs", "job emails from last week", "search my inbox"
- search_apps: "show my applications", "which companies ghosted me", "list SAP BTP roles I analyzed", "any interviews?", "recent applications", "my history", "show rejected apps"
- pause_mode: "pause the bot", "pause briefings until May 20", "stop daily messages", "take a break", "I'm on vacation", "resume job search", "turn briefings back on"
- set_preferences: "set preferences: SAP BTP top priority, salary min $90k, remote only", "I prefer remote jobs", "no roles in New York", "show my preferences", "update my job filters"
- log_recruiter: "recruiter John from Deloitte contacted me about SAP BTP", "save recruiter sarah@tcs.com", "show my recruiters", "who are my active recruiters", "best recruiters"
- company_info: asking about a company's culture, size, reputation
- compare_jobs: comparing two or more roles
- status: asking about progress, application count, stats
- general: casual chat, motivation, anything else

━━━ OUTPUT FORMAT ━━━
ALWAYS respond with valid JSON only — no markdown, no extra text outside the JSON:
{
  "intent": "...",
  "mode": "friend|coach|driver|mentor|advisor",
  "response": "Your message to Harsha",
  "structured": null
}

For analyze_job, structured = {
  "title": "job title",
  "company": "company name",
  "exp_required": "X years",
  "visa_sponsor": "Yes/No/Unknown",
  "salary": "$X-$Y or Unknown",
  "location": "City, State or Remote",
  "link": "apply URL or null",
  "score": 8,
  "classification": "APPLY NOW",
  "reasoning": "1-2 sentence honest assessment",
  "keywords": ["BTP", "CPI", "Integration Suite"],
  "missing_skills": ["Skill1", "Skill2"],
  "ats_score": 82
}

For cover_letter: structured = null. Full 3-paragraph letter in response. Sound like a real person wrote it — not a template. Para 1: why this role + company specifically. Para 2: concrete proof (RICEF, OData, S/4HANA, AI project). Para 3: OPT/H1B situation + call to action.

For interview_prep: structured = null. 8–10 questions with answer frameworks. 3 technical (role-specific, tied to Harsha's real experience), 3 behavioral (STAR), 2 company-fit, 1 salary negotiation tip.

For skill_gap: structured = null. Each key skill: ✅ Have / ❌ Missing / ⚡ Partial. Top 3 gaps ranked by impact + fastest path to close each one.

For applied: structured = { "company": "name", "role": "title" }
For get_resume: structured = { "title": "role", "company": "company", "keywords": ["kw1"], "apply_link": "url or null" }
For mark_outcome: structured = { "company": "name", "outcome": "interview|rejected|offer|ghosted", "stage": "phone_screen|take_home|onsite|final_round|null" }
  stage: extract if mentioned ("phone screen passed", "take-home from", "final round at"). Use null if not specified.
For check_emails: structured = { "days_back": 7, "role_filter": ["SAP BTP", "SAP ABAP"], "exp_years": null, "extra_keywords": [] }
  response: short scanning message. Example: "Checking your inbox — last 7 days, filtering for SAP BTP roles. One sec."
For search_apps: structured = { "status_filter": "all|applied|interview|rejected|offer|ghosted", "role_filter": "SAP BTP", "days_back": 30 }
  status_filter: extract the status Harsha is asking about ("ghosted me" → "ghosted"). Default "all". days_back: default 30.
  response: short acknowledgment. "Looking through your applications..."
For pause_mode: structured = { "action": "pause|resume", "resume_date": "YYYY-MM-DD or null" }
  resume_date: extract date if mentioned ("until May 20" → "2026-05-20"). null if indefinite.
  response: short confirmation. "Bot paused until [date]." or "You're back. Let's find that job."
For set_preferences: structured = { "action": "set|show", "role_priorities": {"SAP BTP": 1, "Data Analyst": 2}, "salary_min": 90000, "location_pref": "remote|hybrid|onsite|any", "excluded_locations": ["New York"], "experience_range": "5-8" }
  Only include fields Harsha actually mentioned. action: "show" if asking to see preferences, "set" if defining them.
  response: short confirmation. "Preferences saved." or "Here are your preferences:"
For log_recruiter: structured = { "action": "log|show", "name": "John", "company": "Deloitte", "email": "john@deloitte.com", "role": "SAP BTP", "source": "email|linkedin|direct" }
  action: "show" if asking to see recruiters, "log" if saving one.
  response: short confirmation. "Saved John from Deloitte." or "Here are your recruiters:"
For company_info, compare_jobs, general, status: structured = null`;

// ── Gmail job extraction prompt ──────────────────────────────────────────────
const GMAIL_EXTRACT_PROMPT = `You are a job extraction AI for Harsha, an SAP ABAP developer on OPT visa seeking H1B sponsorship.

HARSHA'S PROFILE:
- SAP ABAP Developer, 5+ years (LTI Mindtree, Doowon, Elsoft)
- Target: SAP BTP, SAP Technical Consultant, AI Automation, Data Analyst, BI Analyst
- Location: Sunnyvale CA, prefers remote
- Skills: ABAP, RICEF, S/4HANA, OData, BAPI, IDoc, n8n, Claude API, SQL

Extract the job from this email and score it against Harsha's profile.

Return ONLY valid JSON (no markdown):
{
  "is_job": true,
  "title": "job title",
  "company": "company name",
  "location": "city/remote",
  "visa_sponsor": "Yes/No/Unknown",
  "salary": "$X-$Y or Unknown",
  "exp_required": "X years",
  "apply_link": "URL or null",
  "score": 7,
  "classification": "APPLY NOW",
  "reasoning": "1-2 sentence honest assessment",
  "keywords": ["kw1", "kw2"],
  "alert_text": "full Telegram alert message (see format below)"
}

alert_text format:
📨 *New Job from Email*

💼 [Title] @ [Company]
📍 [Location] | 💰 [Salary] | 🛂 H1B: [Yes/No/Unknown]
⭐ Score: [X]/10 — [APPLY NOW/MAYBE/SKIP]

[1-2 sentence reasoning]

🔗 [apply_link or "Link in your email"]

Reply *"resume"* to generate your tailored CV.

If the email is NOT about a job opening (newsletter, promo, billing, etc.), return: {"is_job": false}`;

// ── Code: Process incoming Telegram message ──────────────────────────────────
const CODE_PROCESS_MESSAGE = `
const sd  = $getWorkflowStaticData('global');
const msg = $json.message || $json;
const text   = (msg.text || msg.caption || '').trim();
const chatId = msg.chat?.id || sd.chatId || '';

if (chatId && !sd.chatId) sd.chatId = chatId;

if (!Array.isArray(sd.history)) sd.history = [];
sd.history.push({ role: 'user', content: text });
if (sd.history.length > 8) sd.history = sd.history.slice(-8);

const messages = sd.history.slice(-6).map(h => ({ role: h.role, content: h.content }));
const claudeBody = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 2048, system: ${JSON.stringify(SYSTEM_PROMPT)}, messages });

return [{ json: { chatId, userMessage: text, messages, lastJob: sd.lastAnalyzedJob || null, claudeBody } }];
`.trim();

// ── Code: Parse Claude response ───────────────────────────────────────────────
const CODE_PARSE_CLAUDE = `
const sd = $getWorkflowStaticData('global');
const raw = $json.content?.[0]?.text || $json.choices?.[0]?.message?.content || '';

let parsed;
try {
  // Try full parse first (clean markdown fences)
  const clean = raw.replace(/^\`\`\`json\\s*/i, '').replace(/\`\`\`\\s*$/, '').trim();
  parsed = JSON.parse(clean);
} catch(e) {
  // Claude sometimes adds text after the JSON — extract just the JSON object
  try {
    const jsonMatch = raw.match(/\\{[\\s\\S]*\\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('no JSON found');
    }
  } catch(e2) {
    parsed = { intent: 'general', mode: 'friend', response: raw || 'Sorry, something went wrong. Try again.', structured: null };
  }
}

if (!Array.isArray(sd.history)) sd.history = [];
sd.history.push({ role: 'assistant', content: parsed.response });
if (sd.history.length > 8) sd.history = sd.history.slice(-8);

if (parsed.intent === 'analyze_job' && parsed.structured) {
  sd.lastAnalyzedJob = parsed.structured;
}

const today = new Date().toDateString();
if (!sd.dailyActivity)        sd.dailyActivity = {};
if (!sd.dailyActivity[today]) sd.dailyActivity[today] = { analyzed: 0, applied: 0, lastActive: Date.now() };
if (parsed.intent === 'analyze_job') sd.dailyActivity[today].analyzed++;
if (parsed.intent === 'applied')     sd.dailyActivity[today].applied++;
sd.dailyActivity[today].lastActive = Date.now();

const days = Object.keys(sd.dailyActivity);
if (days.length > 30) {
  sd.dailyActivity = Object.fromEntries(days.sort().slice(-30).map(d => [d, sd.dailyActivity[d]]));
}

const chatId  = $('Process Message').item.json.chatId;
const lastJob = sd.lastAnalyzedJob || null;

// For analyze_job, build a nicely formatted card instead of raw response
if (parsed.intent === 'analyze_job' && parsed.structured) {
  const s = parsed.structured;
  const icon = s.score >= 8 ? '🟢' : s.score >= 5 ? '🟡' : '🔴';
  const classLabel = s.classification || (s.score >= 8 ? 'APPLY NOW' : s.score >= 5 ? 'MAYBE' : 'SKIP');
  const applyLine  = s.link ? \`\\n🔗 Apply: \${s.link}\` : '';
  const missingLine = s.missing_skills?.length ? \`\\n⚡ Gaps: \${s.missing_skills.slice(0,2).join(', ')}\` : '';
  const atsLine    = s.ats_score ? \`\\n📊 ATS Match: \${s.ats_score}%\` : '';

  const formattedResponse = \`\${icon} *\${classLabel}* — Score: \${s.score}/10

💼 *\${s.title}* @ \${s.company}
📍 \${s.location || 'N/A'} | 💰 \${s.salary || 'Unknown'} | 🛂 H1B: \${s.visa_sponsor || 'Unknown'}
⏳ Exp: \${s.exp_required || 'N/A'}\${atsLine}\${missingLine}\${applyLine}

\${parsed.response}

👉 Reply *"resume"* for your tailored CV or *"cover letter"* to draft one.\`;

  parsed.response = formattedResponse;
}

// Inject saved-preferences indicators into job analysis card
if (parsed.intent === 'analyze_job' && parsed.structured && sd.preferences) {
  const p = sd.preferences;
  const s = parsed.structured;
  const title = (s.title || '').toLowerCase();
  const loc   = (s.location || '').toLowerCase();
  const prefNotes = [];

  if (p.role_priorities) {
    for (const [role, tier] of Object.entries(p.role_priorities)) {
      if (title.includes(role.toLowerCase())) {
        prefNotes.push(tier === 1 ? '⭐ Tier 1 priority match (' + role + ')' : '📌 Tier ' + tier + ' match (' + role + ')');
        break;
      }
    }
  }
  if (p.location_pref === 'remote' && !loc.includes('remote')) {
    prefNotes.push('⚠️ Not listed as remote — verify before applying');
  }
  if (p.excluded_locations?.some(ex => loc.includes(ex.toLowerCase()))) {
    prefNotes.push('🚫 Excluded location — flagged by your preferences');
  }
  if (p.salary_min) {
    const salRaw = (s.salary || '');
    const salMatch = salRaw.match(/\\$([\\d,]+)(k)?/i);
    const salNum = salMatch ? parseFloat(salMatch[1].replace(/,/g,'')) * (salMatch[2] ? 1000 : 1) : 0;
    if (salNum > 0 && salNum < p.salary_min) {
      prefNotes.push('⚠️ Below salary floor ($' + p.salary_min.toLocaleString() + ')');
    }
  }
  if (prefNotes.length > 0) {
    parsed.response = parsed.response + '\\n\\n' + prefNotes.join('\\n');
  }
}

return [{ json: { ...parsed, chatId, lastJob } }];
`.trim();

// ── Code: Split long messages (Telegram 4096 char limit) ────────────────────
const CODE_SPLIT_MESSAGE = `
const text   = $json.response || $json.text || '';
const chatId = $json.chatId;
const MAX    = 3800;

if (text.length <= MAX) {
  return [{ json: { chatId, text } }];
}

const chunks = [];
let current  = '';
for (const line of text.split('\\n')) {
  if ((current + '\\n' + line).length > MAX) {
    if (current) chunks.push(current.trim());
    current = line;
  } else {
    current = current ? current + '\\n' + line : line;
  }
}
if (current) chunks.push(current.trim());

return chunks.map(chunk => ({ json: { chatId, text: chunk } }));
`.trim();

// ── Code: Restore applied data after Sheets node ─────────────────────────────
const CODE_RESTORE_APPLIED = `
return [{ json: {
  chatId: $('Process: Log Applied').item.json.chatId,
  text:   $('Process: Log Applied').item.json.text,
}}];
`.trim();

// ── Code: Restore outcome data after Sheets node ─────────────────────────────
const CODE_RESTORE_OUTCOME = `
return [{ json: {
  chatId: $('Process: Mark Outcome').item.json.chatId,
  text:   $('Process: Mark Outcome').item.json.text,
}}];
`.trim();

// ── Code: Prepare resume build command ───────────────────────────────────────
const CODE_PREP_RESUME = `
const sd  = $getWorkflowStaticData('global');
// Prefer lastJob/static data (clean from analyze_job) — Claude's get_resume structured
// output sometimes adds "(or target company)" noise to company names
const job = $json.lastJob || sd.lastAnalyzedJob || $json.structured || null;

if (!job || (!job.company && !job.title)) {
  return [{ json: {
    chatId:  $json.chatId || sd.chatId,
    text:    "⚠️ No job analyzed yet\\. Paste a job description first, then say *\\"resume\\"* and I'll build a tailored CV for it\\.",
    noJob:   true,
    buildCmd: null,
    outputPath: null,
  }}];
}

const company   = (job.company || 'Company').replace(/[^a-zA-Z0-9]/g,'_');
const role      = job.title    || 'SAP Consultant';
const keywords  = (job.keywords || []).join(', ');
const applyLink = job.link || job.apply_link || null;
const expReq    = job.exp_required || 'Not specified';

const kw = keywords || 'SAP BTP, S/4HANA, OData, RICEF';
const tailoredSummary =
  \`SAP ABAP developer with 5+ years of hands-on experience building enterprise integrations, \\
OData services, RICEF objects, and S/4HANA solutions for global clients. \\
Strong foundation in \${kw} — with real delivery experience across SD, MM, and BW landscapes. \\
Built a production AI automation system from scratch (n8n + Claude API + Oracle Cloud, running 24/7), \\
which sharpened hands-on skills in REST APIs, event-driven workflows, and cloud-native thinking — \\
the same patterns that power SAP BTP and Integration Suite. \\
Master's in Data Analytics, Indiana Wesleyan University (2025). Based in Sunnyvale, CA. Seeking H1B sponsorship.\`;

const dateStamp  = new Date().toISOString().split('T')[0];
const outputPath = \`/home/ubuntu/n8n-files/HarshaYelamati_\${company}_\${dateStamp}.docx\`;
const pdfPath    = \`/home/ubuntu/n8n-files/HarshaYelamati_\${company}_\${dateStamp}.pdf\`;

const ctx = JSON.stringify({
  summary:    tailoredSummary,
  company:    job.company || 'Company',
  role,
  keywords:   job.keywords || [],
  outputPath,
});

// Store for LOG_APPLIED to reference which resume version was sent
sd.lastResumeGenerated = { company: job.company || 'Company', role, path: outputPath, date: dateStamp };

return [{ json: {
  buildCmd:   \`node ${SCRIPTS_DIR}/build_resume_dynamic.js '\${ctx.replace(/'/g, "'\\\\''")}'\`,
  outputPath,
  pdfPath,
  company:    job.company || 'Company',
  role, keywords, applyLink, expReq,
  chatId: $json.chatId || sd.chatId,
} }];
`.trim();

// ── Code: Format resume ready message ────────────────────────────────────────
const CODE_RESUME_MESSAGE = `
// readBinaryFile wipes $json — reference the Prep node directly
const prep    = $('Prep: Resume Build').item.json;
const company = prep.company || 'Company';
const role    = prep.role    || 'SAP Consultant';
const keywords  = prep.keywords  || 'your target role';
const applyLink = prep.applyLink || null;
const expReq    = prep.expReq    || 'Not specified';
const chatId    = prep.chatId;

const applyLine = applyLink ? \`\\n🔗 Apply: \${applyLink}\` : '';

const text = \`📄 *Resume ready — \${role} @ \${company}*

✅ Tailored to: \${keywords}
📋 Role: \${role}
⏳ Exp needed: \${expReq}\${applyLine}

Good luck! 🙌\`;

return [{ json: { text, chatId } }];
`.trim();

// ── Code: Log application ─────────────────────────────────────────────────────
const CODE_LOG_APPLIED = `
const sd = $getWorkflowStaticData('global');
const { structured, chatId } = $json;
const company = structured?.company || 'Unknown Company';
const role    = structured?.role    || 'Unknown Role';
const today   = new Date().toISOString().split('T')[0];
const job     = sd.lastAnalyzedJob || {};

if (!Array.isArray(sd.applications)) sd.applications = [];
sd.applications.push({ company, role, dateApplied: today, status: 'Applied' });

const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
const weekCount = sd.applications.filter(a => new Date(a.dateApplied) >= weekAgo).length;
const followUpDate = new Date(); followUpDate.setDate(followUpDate.getDate() + 7);
const followUpStr  = followUpDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const resumeVersion = sd.lastResumeGenerated
  ? \`\${sd.lastResumeGenerated.company}_\${sd.lastResumeGenerated.date}\`
  : '';

return [{ json: {
  chatId,
  text: \`✅ *Logged!* \${role} @ \${company}\\n\\nApplied: Today (\${today})\\nFollow-up: \${followUpStr}\\n\\nThis week: \${weekCount} application\${weekCount !== 1 ? 's' : ''}. Keep going.\`,
  // Spread rowData flat so Sheets autoMapInputData writes correct columns
  Company:          company,
  Role:             role,
  'Date Applied':   today,
  Status:           'Applied',
  Source:           'Manual',
  Score:            job.score          || '',
  Classification:   job.classification || '',
  'Visa Sponsor':   job.visa_sponsor   || '',
  Salary:           job.salary         || '',
  Location:         job.location       || '',
  'Apply Link':     job.link || job.apply_link || '',
  Keywords:         (job.keywords || []).join(', '),
  'Resume Version': resumeVersion,
  'Outcome Date':   '',
  Notes:            '',
} }];
`.trim();

// ── Code: Process mark_outcome ────────────────────────────────────────────────
const CODE_MARK_OUTCOME = `
const sd = $getWorkflowStaticData('global');
const chatId = $json.chatId || sd.chatId;
const structured = $json.structured || {};
const company = structured.company || 'Unknown';
const outcome = structured.outcome || 'unknown';
const stage   = structured.stage   || null;

const stageEmoji = { phone_screen: '📞', take_home: '📝', onsite: '🏢', final_round: '🎯', offer: '💰' };
const stageLabel = { phone_screen: 'Phone Screen', take_home: 'Take-Home', onsite: 'Onsite', final_round: 'Final Round', offer: 'Offer' };

if (Array.isArray(sd.applications)) {
  const app = sd.applications.find(a =>
    a.company.toLowerCase().includes(company.toLowerCase()) ||
    company.toLowerCase().includes(a.company.toLowerCase())
  );
  if (app) {
    const statusMap = { interview: 'Interview', rejected: 'Rejected', offer: 'Offer', ghosted: 'Ghosted' };
    app.status = statusMap[outcome] || app.status;
    app.outcomeDate = new Date().toISOString().split('T')[0];
    if (stage) app.stage = stage;
  }
}

const statusLabel = { interview: 'Interview', rejected: 'Rejected', offer: 'Offer', ghosted: 'Ghosted' }[outcome] || outcome;
const outcomeDate = new Date().toISOString().split('T')[0];
const stagePart   = stage ? \`\\n🔖 Stage: \${stageEmoji[stage] || ''} \${stageLabel[stage] || stage.replace(/_/g,' ')}\` : '';
const matchedApp  = sd.applications?.find(a => a.company.toLowerCase().includes(company.toLowerCase()));

// Build confirmation text (use Claude's response + stage info)
const text = ($json.response || 'Outcome logged.') + stagePart;

// Also add to sd.applications if company wasn't previously tracked
if (!matchedApp && Array.isArray(sd.applications)) {
  const statusMap = { interview: 'Interview', rejected: 'Rejected', offer: 'Offer', ghosted: 'Ghosted' };
  sd.applications.push({ company, role: '', dateApplied: outcomeDate, status: statusMap[outcome] || outcome, outcomeDate, stage: stage || null });
}

return [{ json: {
  chatId,
  text,
  // Spread flat for Sheets autoMapInputData
  Company:        company,
  Role:           matchedApp?.role || '',
  'New Status':   statusLabel,
  Stage:          stage ? (stageLabel[stage] || stage) : '',
  'Outcome Date': outcomeDate,
  Notes:          '',
} }];
`.trim();

// ── Code: Filter Gmail emails for job-related ones ────────────────────────────
const CODE_FILTER_JOB_EMAIL = `
const email = $json;
const from    = (email.from?.value?.[0]?.address || String(email.from || '')).toLowerCase();
const subject = (email.subject || '').toLowerCase();

const jobSenders  = ['linkedin','indeed','dice.com','glassdoor','ziprecruiter',
  'monster','careerbuilder','recruit','talent','hiring','hr@','careers@','jobs@'];
const jobKeywords = ['job','position','opportunity','role','opening',
  'hiring','recruiter','apply','sap','developer','analyst','consultant',
  'engineer','automation','abap','btp','data','remote'];

const isSenderMatch  = jobSenders.some(s => from.includes(s));
const isSubjectMatch = jobKeywords.some(k => subject.includes(k));

if (!isSenderMatch && !isSubjectMatch) return [];

const emailText = \`From: \${from}\\nSubject: \${email.subject || 'No subject'}\\n\\n\${(email.text || email.snippet || '').slice(0, 3000)}\`;
const claudeBody = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1024, system: ${JSON.stringify(GMAIL_EXTRACT_PROMPT)}, messages: [{ role: 'user', content: emailText }] });
return [{ json: { emailText, claudeBody } }];
`.trim();

// ── Code: Parse Gmail job Claude response ─────────────────────────────────────
const CODE_PARSE_GMAIL_JOB = `
const sd  = $getWorkflowStaticData('global');
const raw = $json.content?.[0]?.text || '';

let parsed;
try {
  const clean = raw.replace(/^\`\`\`json\\s*/i, '').replace(/\`\`\`\\s*$/, '').trim();
  parsed = JSON.parse(clean);
} catch(e) { return []; }

if (!parsed.is_job) return [];

const jobKey = \`\${(parsed.title||'').toLowerCase()}_\${(parsed.company||'').toLowerCase()}\`;
if (!Array.isArray(sd.seenGmailJobs)) sd.seenGmailJobs = [];
if (sd.seenGmailJobs.includes(jobKey)) return [];
sd.seenGmailJobs.push(jobKey);
if (sd.seenGmailJobs.length > 500) sd.seenGmailJobs = sd.seenGmailJobs.slice(-500);

const jobData = {
  title: parsed.title, company: parsed.company,
  link: parsed.apply_link, apply_link: parsed.apply_link,
  keywords: parsed.keywords || [], exp_required: parsed.exp_required,
  visa_sponsor: parsed.visa_sponsor, salary: parsed.salary,
  location: parsed.location, score: parsed.score,
  classification: parsed.classification,
  source: 'Gmail',
};

sd.lastAnalyzedJob = jobData;

// Feed morning briefing digest queue
if (!Array.isArray(sd.digestQueue)) sd.digestQueue = [];
sd.digestQueue.push(jobData);
if (sd.digestQueue.length > 20) sd.digestQueue = sd.digestQueue.slice(-20);

const chatId = sd.chatId;
if (!chatId) return [];

return [{ json: {
  chatId,
  text: parsed.alert_text || \`📨 New job: \${parsed.title} @ \${parsed.company}\\n⭐ \${parsed.score}/10 — \${parsed.classification}\`,
} }];
`.trim();

// ── Code: Follow-up checker ───────────────────────────────────────────────────
const CODE_FOLLOWUP_CHECKER = `
const sd = $getWorkflowStaticData('global');
const chatId = sd.chatId;
if (!chatId) return [];
if (sd.pausedUntil && new Date() < new Date(sd.pausedUntil)) return [];

const todayStr = new Date().toISOString().split('T')[0];
const today = new Date(todayStr);
const reminders = (sd.applications || []).filter(a => {
  if (a.status !== 'Applied') return false;
  const daysAgo = Math.floor((today - new Date(a.dateApplied)) / 86400000);
  return daysAgo === 7 || daysAgo === 14;
});

if (reminders.length === 0) return [];

return reminders.map(app => {
  const daysAgo = Math.floor((today - new Date(app.dateApplied)) / 86400000);
  return { json: { chatId, text:
    \`📬 *Follow-up Reminder*

\${app.role} @ \${app.company}
Applied \${daysAgo} days ago — no response logged yet.

💬 Suggested message:
_"Hi, I wanted to follow up on my application for the \${app.role} role at \${app.company}. I remain very interested and would love to connect. Thank you."_

Reply *"sent \${app.company}"* to mark followed up, or *"rejected \${app.company}"* if you heard back.\` } };
});
`.trim();

// ── Code: Morning briefing ────────────────────────────────────────────────────
const CODE_MORNING_BRIEFING = `
const sd = $getWorkflowStaticData('global');
const chatId = sd.chatId;
if (!chatId) return [];
if (sd.pausedUntil && new Date() < new Date(sd.pausedUntil)) return [];

const queue = (sd.digestQueue || []).sort((a,b) => (b.score||0)-(a.score||0));
const top3  = queue.slice(0, 3);
sd.digestQueue = queue.slice(3);

const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });

let body = top3.length === 0
  ? 'No new jobs queued yet. Paste a job description to analyze it, or check your email for job alerts.'
  : top3.map((j,i) => {
      const icon = j.score >= 7 ? '🟢' : j.score >= 5 ? '🟡' : '🟠';
      return \`\${i+1}. \${icon} *\${j.title}* @ \${j.company||'N/A'}\\n    ⭐\${j.score}/10 | \${j.source||''}\`;
    }).join('\\n\\n');

return [{ json: { chatId, text:
  \`☀️ Good morning, Harsha. \${today}

\${top3.length > 0 ? \`Top \${top3.length} job\${top3.length>1?'s':''} for today:\` : "Today's jobs:"}

\${body}

Paste any job to analyze it. Say *"resume"* after analyzing to get your tailored CV.\` } }];
`.trim();

// ── Code: Evening summary ─────────────────────────────────────────────────────
const CODE_EVENING_SUMMARY = `
const sd = $getWorkflowStaticData('global');
const chatId = sd.chatId;
if (!chatId) return [];
if (sd.pausedUntil && new Date() < new Date(sd.pausedUntil)) return [];

const today    = new Date().toDateString();
const activity = sd.dailyActivity?.[today] || { analyzed: 0, applied: 0 };
const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
const weekApps = (sd.applications || []).filter(a => new Date(a.dateApplied) >= weekAgo).length;

const mood = activity.applied === 0
  ? "⚡ *You didn't apply today. That's a day lost. Tomorrow — pick 2 and apply. No delays.*"
  : activity.applied >= 3 ? "💪 Solid day. Consistency is what gets you hired."
  : "Good progress. Keep the momentum.";

return [{ json: { chatId, text:
  \`🌙 *End of day — \${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}*

Today: Applied *\${activity.applied}* | Analyzed *\${activity.analyzed}*
This week: *\${weekApps}* applications

\${mood}\` } }];
`.trim();

// ── Weekly coach prompt (Phase 2G) ───────────────────────────────────────────
const WEEKLY_COACH_PROMPT = `You are HarryJobBuddy's weekly career coach. Analyze this week's job search data for Harsha — SAP ABAP developer, OPT visa, Sunnyvale CA, targeting SAP BTP + Data Analyst + AI Automation roles.

Be data-driven and direct. Under 280 words. Use Telegram Markdown (* for bold, _ for italic).

Format your response EXACTLY as:
📊 *Week [dateRange] Review*

*Stats:* [applied]/[responses]/[interviews] — [conversion rate]% response rate

*Trend:* [📈 Up / 📉 Down / ➡️ Flat] vs last week ([lastWeek] applications)

*Pattern:* [1-2 sentences on what role types responded, what didn't, what this tells Harsha]

⚡ *Next week:*
• [Specific action 1 — role type + target companies]
• [Specific action 2 — something to fix or try differently]
• [Specific action 3 — only if truly useful, else skip]

[If 0 applications: be blunt. No sympathy, just facts and a specific plan.]`;

// ── Code: Weekly review ───────────────────────────────────────────────────────
const CODE_WEEKLY_REVIEW = `
const sd = $getWorkflowStaticData('global');
const chatId = sd.chatId;
if (!chatId) return [];
if (sd.pausedUntil && new Date() < new Date(sd.pausedUntil)) return [];

const now = new Date();
const weekAgo     = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
const allApps     = sd.applications || [];

const thisWeek = allApps.filter(a => new Date(a.dateApplied) >= weekAgo);
const lastWeek = allApps.filter(a => {
  const d = new Date(a.dateApplied);
  return d >= twoWeeksAgo && d < weekAgo;
});

const responses     = thisWeek.filter(a => a.status !== 'Applied').length;
const interviews    = thisWeek.filter(a => ['Interview','Phone Screen','Take-Home','Onsite','Final Round'].includes(a.status)).length;
const lastInterviews = lastWeek.filter(a => ['Interview','Phone Screen','Take-Home','Onsite','Final Round'].includes(a.status)).length;
const convRate      = thisWeek.length > 0 ? Math.round((responses / thisWeek.length) * 100) : 0;

const roleBreakdown = {};
thisWeek.forEach(a => {
  const r = (a.role || '').toLowerCase();
  const key = r.includes('sap') ? 'SAP' : r.includes('data') ? 'Data Analyst' : r.includes('ai') || r.includes('automat') ? 'AI/Automation' : 'Other';
  roleBreakdown[key] = (roleBreakdown[key] || 0) + 1;
});

const trendDir = thisWeek.length > lastWeek.length ? 'up' : thisWeek.length < lastWeek.length ? 'down' : 'flat';
const dateRange = weekAgo.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – ' + now.toLocaleDateString('en-US',{month:'short',day:'numeric'});

const statsData = {
  thisWeekApplied:  thisWeek.length,
  lastWeekApplied:  lastWeek.length,
  responses,
  interviews,
  lastInterviews,
  convRate,
  roleBreakdown,
  trendDir,
  topCompany:       thisWeek[thisWeek.length-1]?.company || 'N/A',
  totalAllTime:     allApps.length,
  dateRange,
  recruiters:       (sd.recruiters || []).length,
};

// Pre-build entire Claude API body so the HTTP node body is just ={{ $json.claudeBody }}
const statsMessage = 'Weekly job search data for Harsha:\\n\\n' + JSON.stringify(statsData, null, 2);
const claudeBody = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1024, system: ${JSON.stringify(WEEKLY_COACH_PROMPT)}, messages: [{ role: 'user', content: statsMessage }] });

return [{ json: { chatId, statsMessage, claudeBody } }];
`.trim();

// ── Code: Status report ───────────────────────────────────────────────────────
const CODE_STATUS = `
const sd     = $getWorkflowStaticData('global');
const chatId = $json.chatId || sd.chatId;

const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
const apps     = sd.applications || [];
const weekApps = apps.filter(a => new Date(a.dateApplied) >= weekAgo);
const pending    = apps.filter(a => a.status === 'Applied').length;
const interviews = apps.filter(a => ['Interview','Phone Screen','Take-Home','Onsite','Final Round'].includes(a.status)).length;
const offers     = apps.filter(a => a.status === 'Offer').length;
const today      = new Date().toDateString();
const todayAct   = sd.dailyActivity?.[today] || { analyzed: 0, applied: 0 };
const recCount   = (sd.recruiters || []).length;
const lastResume = sd.lastResumeGenerated
  ? \`\${sd.lastResumeGenerated.role} @ \${sd.lastResumeGenerated.company} (\${sd.lastResumeGenerated.date})\`
  : 'None generated yet';
const pauseNote = sd.pausedUntil && new Date() < new Date(sd.pausedUntil)
  ? \`\\n⏸️ Bot paused until \${new Date(sd.pausedUntil).toLocaleDateString('en-US',{month:'short',day:'numeric'})}\`
  : '';

return [{ json: { chatId, text:
  \`📊 *Your Job Search Status*\${pauseNote}

This week: \${weekApps.length} applications | All time: \${apps.length}
Pending: \${pending} | Interviews: \${interviews} | Offers: \${offers}
Recruiters saved: \${recCount}

Today: Applied \${todayAct.applied} | Analyzed \${todayAct.analyzed}
Last resume: \${lastResume}

Recent:
\${apps.slice(-5).reverse().map(a => \`• \${a.role} @ \${a.company} (\${a.status}\${a.stage ? ' · ' + a.stage.replace(/_/g,' ') : ''})\`).join('\\n') || 'None yet'}\` } }];
`.trim();

// ── Code: Parse Claude's weekly coach response ────────────────────────────────
const CODE_PARSE_COACH = `
const chatId = $('Run: Weekly Review').item.json.chatId;
const raw    = $json.content?.[0]?.text || $json.choices?.[0]?.message?.content || '';
const text   = raw.replace(/^\`\`\`(?:markdown)?\\s*/i,'').replace(/\`\`\`\\s*$/,'').trim()
  || '📊 *Weekly Review*\\n\\nNot enough data yet to generate your coaching report. Keep logging applications — the analysis improves as your history builds.';
return [{ json: { chatId, text } }];
`.trim();

// ── Code: Application search & recall ────────────────────────────────────────
const CODE_SEARCH_APPS = `
const sd = $getWorkflowStaticData('global');
const chatId     = $json.chatId || sd.chatId;
const structured = $json.structured || {};
const statusFilter = (structured.status_filter || 'all').toLowerCase();
const roleFilter   = (structured.role_filter   || '').toLowerCase();
const daysBack     = structured.days_back || 30;

const apps   = sd.applications || [];
const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);

const filtered = apps.filter(a => {
  const withinDays  = new Date(a.dateApplied) >= cutoff;
  const statusMatch = statusFilter === 'all' || (a.status || '').toLowerCase().includes(statusFilter);
  const roleMatch   = !roleFilter || (a.role || '').toLowerCase().includes(roleFilter) || (a.company || '').toLowerCase().includes(roleFilter);
  return withinDays && statusMatch && roleMatch;
});

if (filtered.length === 0) {
  const filterDesc = statusFilter !== 'all' ? statusFilter : roleFilter || 'all';
  return [{ json: { chatId, text: \`No applications found (filter: \${filterDesc}, last \${daysBack} days).\\n\\nSay *"status"* for your full summary.\` } }];
}

const statusEmoji = { applied:'📤', interview:'📞', rejected:'❌', offer:'💰', ghosted:'👻', withdrawn:'↩️' };
const sorted = filtered.sort((a,b) => new Date(b.dateApplied) - new Date(a.dateApplied));

const lines = sorted.slice(0,15).map(a => {
  const icon  = statusEmoji[(a.status||'').toLowerCase()] || '📋';
  const stage = a.stage ? \` (\${a.stage.replace(/_/g,' ')})\` : '';
  return \`\${icon} *\${a.role||'Unknown'}* @ \${a.company||'?'}\\n   \${a.dateApplied||'?'} · \${a.status||'Applied'}\${stage}\`;
}).join('\\n\\n');

const more = sorted.length > 15 ? \`\\n\\n_...and \${sorted.length-15} more_\` : '';
const filterNote = statusFilter !== 'all' ? statusFilter : roleFilter || 'all';

return [{ json: { chatId, text:
  \`📋 *Applications — last \${daysBack} days* (\${filtered.length} found | filter: \${filterNote})\\n\\n\${lines}\${more}\`
} }];
`.trim();

// ── Code: Pause / vacation mode ───────────────────────────────────────────────
const CODE_PAUSE_MODE = `
const sd = $getWorkflowStaticData('global');
const chatId     = $json.chatId || sd.chatId;
const structured = $json.structured || {};
const action     = (structured.action || 'pause').toLowerCase();

if (action === 'resume' || action === 'unpause') {
  sd.pausedUntil = null;
  return [{ json: { chatId, text: \`✅ *Bot resumed.*\\n\\nDaily briefings are back on. Follow-up reminders active.\\n\\nLet's get you hired. 💪\` } }];
}

const resumeDate = structured.resume_date || null;
if (resumeDate) {
  sd.pausedUntil = resumeDate;
  const d = new Date(resumeDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  return [{ json: { chatId, text: \`⏸️ *Bot paused until \${d}.*\\n\\nNo morning briefings, evening summaries, or follow-up reminders until then.\\n\\nSay *"resume job search"* anytime to turn it back on.\` } }];
}

// Pause indefinitely
sd.pausedUntil = '2099-12-31';
return [{ json: { chatId, text: \`⏸️ *Bot paused.*\\n\\nNo scheduled messages until you say *"resume job search"*.\\n\\nYour data stays intact. Job search picks up where you left off.\` } }];
`.trim();

// ── Code: Job search preferences ─────────────────────────────────────────────
const CODE_SET_PREFERENCES = `
const sd = $getWorkflowStaticData('global');
const chatId     = $json.chatId || sd.chatId;
const structured = $json.structured || {};
const action     = (structured.action || 'set').toLowerCase();

if (action === 'show') {
  const p = sd.preferences || {};
  if (!p.role_priorities && !p.salary_min && !p.location_pref) {
    return [{ json: { chatId, text: \`⚙️ *No preferences saved yet.*\\n\\nTry: "set preferences: SAP BTP top priority, salary min $90k, remote only, no NYC"\` } }];
  }
  const lines = [];
  if (p.role_priorities)     lines.push(\`🎯 Roles: \${Object.entries(p.role_priorities).map(([r,t])=>\`\${r} (tier \${t})\`).join(', ')}\`);
  if (p.salary_min)          lines.push(\`💰 Salary floor: $\${p.salary_min.toLocaleString()}\`);
  if (p.location_pref)       lines.push(\`📍 Location: \${p.location_pref}\`);
  if (p.excluded_locations?.length) lines.push(\`🚫 Excluded: \${p.excluded_locations.join(', ')}\`);
  if (p.experience_range)    lines.push(\`⏳ Exp range: \${p.experience_range} years\`);
  return [{ json: { chatId, text: \`⚙️ *Your Preferences*\\n\\n\${lines.join('\\n')}\\n\\nSay "update preferences: ..." to change any of these.\` } }];
}

if (!sd.preferences) sd.preferences = {};
if (structured.role_priorities)    sd.preferences.role_priorities    = structured.role_priorities;
if (structured.salary_min)         sd.preferences.salary_min         = structured.salary_min;
if (structured.location_pref)      sd.preferences.location_pref      = structured.location_pref;
if (structured.excluded_locations) sd.preferences.excluded_locations = structured.excluded_locations;
if (structured.experience_range)   sd.preferences.experience_range   = structured.experience_range;

const p = sd.preferences;
const lines = [];
if (p.role_priorities)     lines.push(\`🎯 \${Object.entries(p.role_priorities).map(([r,t])=>\`\${r} = tier \${t}\`).join(', ')}\`);
if (p.salary_min)          lines.push(\`💰 Salary floor: $\${p.salary_min.toLocaleString()}\`);
if (p.location_pref)       lines.push(\`📍 Location: \${p.location_pref}\`);
if (p.excluded_locations?.length) lines.push(\`🚫 Excluded: \${p.excluded_locations.join(', ')}\`);

return [{ json: { chatId, text:
  \`✅ *Preferences saved.*\\n\\n\${lines.join('\\n')}\\n\\nEvery job I analyze will now check against these. Say *"show preferences"* to review anytime.\`
} }];
`.trim();

// ── Code: Recruiter tracker ───────────────────────────────────────────────────
const CODE_LOG_RECRUITER = `
const sd = $getWorkflowStaticData('global');
const chatId     = $json.chatId || sd.chatId;
const structured = $json.structured || {};
const action     = (structured.action || 'log').toLowerCase();

if (!Array.isArray(sd.recruiters)) sd.recruiters = [];

if (action === 'show') {
  if (sd.recruiters.length === 0) {
    return [{ json: { chatId, text: \`👥 No recruiters saved yet.\\n\\nTry: "recruiter John from Deloitte contacted me about SAP BTP"\`, showOnly: true } }];
  }
  const sorted = sd.recruiters.slice().sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
  const lines  = sorted.slice(0,12).map((r,i) => {
    const src = r.source ? \` · \${r.source}\` : '';
    return \`\${i+1}. *\${r.name||'Unknown'}* @ \${r.company||'?'}\\n   \${r.role||'N/A'} | \${r.email||'No email'}\${src}\\n   \${r.date||''}\`;
  }).join('\\n\\n');
  return [{ json: { chatId, text: \`👥 *Your Recruiters (\${sd.recruiters.length} total)*\\n\\n\${lines}\`, showOnly: true } }];
}

const rec = {
  name:    structured.name    || 'Unknown',
  company: structured.company || 'Unknown',
  email:   structured.email   || '',
  role:    structured.role    || '',
  source:  structured.source  || 'direct',
  date:    new Date().toISOString().split('T')[0],
};

const exists = sd.recruiters.find(r =>
  (r.email && r.email === rec.email) ||
  (r.name?.toLowerCase() === rec.name?.toLowerCase() && r.company?.toLowerCase() === rec.company?.toLowerCase())
);
if (exists) {
  Object.assign(exists, rec);
} else {
  sd.recruiters.push(rec);
}
if (sd.recruiters.length > 200) sd.recruiters = sd.recruiters.slice(-200);

return [{ json: {
  chatId,
  text: \`✅ *Recruiter saved.*\\n\\n👤 \${rec.name} @ \${rec.company}\\n\${rec.email ? '📧 ' + rec.email + '\\n' : ''}🎯 Role: \${rec.role || 'Not specified'}\\n📅 \${rec.date}\\n\\nTotal recruiters: \${sd.recruiters.length}\`,
  // Spread flat for Sheets autoMapInputData
  Name: rec.name, Company: rec.company, Email: rec.email, Role: rec.role, Source: rec.source, Date: rec.date,
  showOnly: false,
} }];
`.trim();

// ── Code: Restore recruiter data after Sheets node ────────────────────────────
const CODE_RESTORE_RECRUITER = `
return [{ json: {
  chatId: $('Process: Recruiter').item.json.chatId,
  text:   $('Process: Recruiter').item.json.text,
}}];
`.trim();

// ── Code: Build Gmail search query from Claude's check_emails structured output ─
const CODE_BUILD_EMAIL_QUERY = `
const sd = $getWorkflowStaticData('global');
const chatId    = $json.chatId || sd.chatId;
const structured = $json.structured || {};
const daysBack   = structured.days_back || 7;
const roleFilter = Array.isArray(structured.role_filter) ? structured.role_filter : [];
const extraKw    = Array.isArray(structured.extra_keywords) ? structured.extra_keywords : [];

// Build "after:" date
const afterDate = new Date();
afterDate.setDate(afterDate.getDate() - daysBack);
const yy = afterDate.getFullYear();
const mm = String(afterDate.getMonth() + 1).padStart(2, '0');
const dd = String(afterDate.getDate()).padStart(2, '0');
const dateStr = yy + '/' + mm + '/' + dd;

// Combine role filters + extra keywords for the query
const coreTerms = ['job', 'position', 'hiring', 'opportunity'];
const techTerms = roleFilter.length > 0 ? roleFilter : ['SAP', 'ABAP', 'consultant', 'developer', 'analyst'];
const allTerms  = [...new Set([...coreTerms, ...techTerms, ...extraKw])].slice(0, 12);
const gmailQuery = 'after:' + dateStr + ' (' + allTerms.join(' OR ') + ')';

// Use Claude's response as the scanning message (it was told to write a short confirm)
const scanningMsg = $json.response || \`🔍 Scanning your inbox — last \${daysBack} days...\\n\\nOne sec.\`;

return [{ json: {
  chatId,
  gmailQuery,
  daysBack,
  roleFilterStr: roleFilter.length > 0 ? roleFilter.join(', ') : 'all roles',
  scanningMsg,
} }];
`.trim();

// ── Code: Score and format Gmail search results ──────────────────────────────
const CODE_SCORE_EMAILS = `
const sd = $getWorkflowStaticData('global');
const buildData    = $('Build: Email Query').item.json;
const chatId       = buildData.chatId;
const daysBack     = buildData.daysBack || 7;
const roleFilterStr = buildData.roleFilterStr || 'all roles';

// $input.all() is available in per-item mode — runs once per email item
// Only output on the LAST item to avoid sending duplicate Telegram messages
const allItems = $input.all();
if ($itemIndex < allItems.length - 1) return [];
const emails   = allItems.map(item => item.json);

const sapTerms    = ['sap', 'abap', 'btp', 's/4hana', 's4hana', 'odata', 'fiori', 'hana', 'integration'];
const targetTerms = ['data analyst', 'data engineer', 'ai automation', 'bi analyst', 'power bi', 'consultant'];
const sponsorKw   = ['h1b', 'h-1b', 'sponsor', 'visa', 'ead', 'opt', 'work authorization'];
const skipTerms   = ['newsletter', 'unsubscribe', 'sale ends', '% off', 'promo code', 'limited offer'];
const jobTerms    = ['job', 'position', 'hiring', 'opening', 'opportunity', 'role', 'developer', 'analyst', 'consultant', 'engineer', 'recruiter'];

function scoreEmail(raw) {
  const subject  = (raw.subject || '').toLowerCase();
  const fromAddr = typeof raw.from === 'object'
    ? (raw.from?.value?.[0]?.address || '')
    : String(raw.from || '');
  const snippet  = (raw.snippet || raw.text || '').slice(0, 500).toLowerCase();
  const combined = subject + ' ' + snippet;

  if (skipTerms.some(t => combined.includes(t)))  return null;
  if (!jobTerms.some(t => combined.includes(t)))  return null;

  let score = 3;
  const sapHits = sapTerms.filter(t => combined.includes(t)).length;
  if (sapHits >= 2)       score += 4;
  else if (sapHits === 1) score += 2;
  if (targetTerms.some(t => combined.includes(t))) score += 1;
  if (sponsorKw.some(t => combined.includes(t)))   score += 2;

  const fromName = typeof raw.from === 'object'
    ? (raw.from?.value?.[0]?.name || fromAddr.split('@')[0])
    : fromAddr.split('@')[0];

  return {
    subject: (raw.subject || 'No subject').slice(0, 65),
    from:    fromName.slice(0, 35),
    score,
    snippet: (raw.snippet || '').slice(0, 90),
  };
}

const scored = emails
  .map(scoreEmail)
  .filter(Boolean)
  .sort((a, b) => b.score - a.score)
  .slice(0, 8);

if (emails.length === 0) {
  return [{ json: { chatId, text: \`🔍 Checked your inbox — last \${daysBack} days.\\n\\nNo emails matched the query. Gmail may not have returned results for that filter.\\n\\nTry: *"check emails last 30 days"*\` } }];
}

if (scored.length === 0) {
  return [{ json: { chatId, text: \`🔍 Scanned your inbox — last \${daysBack} days.\\n\\nFound \${emails.length} email\${emails.length !== 1 ? 's' : ''} but none look like job opportunities after filtering.\\n\\nExpand: *"check emails last 30 days"* or try without a role filter.\` } }];
}

const lines = scored.map((e, i) => {
  const icon = e.score >= 7 ? '🟢' : e.score >= 5 ? '🟡' : '⚪';
  return \`\${i + 1}. \${icon} *\${e.subject}*\\n   📧 \${e.from}\\n   \${e.snippet ? e.snippet.trim() + '...' : ''}\`;
}).join('\\n\\n');

return [{ json: { chatId, text:
  \`🔍 *Inbox scan — last \${daysBack} days* | Filter: \${roleFilterStr}\\n\\nFound \${scored.length} job email\${scored.length !== 1 ? 's' : ''} (of \${emails.length} scanned):\\n\\n\${lines}\\n\\n📬 Check Gmail for the full details. Reply *"resume"* after pasting any JD.\`
} }];
`.trim();

// ── Helper builders ───────────────────────────────────────────────────────────
function codeNode(id, name, jsCode, x, y) {
  return { parameters: { jsCode }, id, name, type: "n8n-nodes-base.code", typeVersion: 2, position: [x, y], onError: "continueRegularOutput" };
}

// Sends $json.text — for code nodes that build their own text
function telegramSend(id, name, x, y) {
  return {
    parameters: {
      chatId: "={{ $json.chatId }}",
      text:   "={{ $json.text }}",
      additionalFields: { parse_mode: "Markdown", disable_web_page_preview: true },
    },
    id, name, type: "n8n-nodes-base.telegram", typeVersion: 1, position: [x, y],
    credentials: { telegramApi: TELEGRAM_CRED },
    onError: "continueRegularOutput",
  };
}

// Sends $json.response — for Claude response passthrough nodes
function telegramSendResponse(id, name, x, y) {
  return {
    parameters: {
      chatId: "={{ $json.chatId }}",
      text:   "={{ $json.response }}",
      additionalFields: { parse_mode: "Markdown", disable_web_page_preview: true },
    },
    id, name, type: "n8n-nodes-base.telegram", typeVersion: 1, position: [x, y],
    credentials: { telegramApi: TELEGRAM_CRED },
    onError: "continueRegularOutput",
  };
}

function scheduleNode(id, name, cronExpr, x, y) {
  return {
    parameters: {
      rule: { interval: [{ field: "cronExpression", expression: cronExpr }] }
    },
    id, name, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1, position: [x, y],
  };
}

// ── Build all nodes ───────────────────────────────────────────────────────────
const nodes = [

  // ══ TELEGRAM WEBHOOK PATH ════════════════════════════════════════════════════

  {
    parameters: { updates: ["message"], additionalFields: {} },
    id: "hj-01", name: "Telegram Trigger",
    type: "n8n-nodes-base.telegramTrigger", typeVersion: 1,
    position: [200, 300], webhookId: "hjb-v6-2026",
    credentials: { telegramApi: TELEGRAM_CRED },
  },

  codeNode("hj-02", "Process Message", CODE_PROCESS_MESSAGE, 450, 300),

  {
    parameters: {
      method: "POST", url: "https://api.anthropic.com/v1/messages",
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: "x-api-key",         value: ANTHROPIC_API_KEY },
        { name: "anthropic-version", value: "2023-06-01" },
        { name: "content-type",      value: "application/json" },
      ]},
      sendBody: true, contentType: "raw", rawContentType: "application/json",
      body: `={{ $json.claudeBody }}`,
      options: {},
    },
    id: "hj-03", name: "Claude: Intent + Response",
    type: "n8n-nodes-base.httpRequest", typeVersion: 4,
    position: [700, 300], onError: "continueRegularOutput",
  },

  codeNode("hj-04", "Parse Claude Response", CODE_PARSE_CLAUDE, 950, 300),

  // Route using chained IF nodes (Switch typeVersion 1 only supports 4 outputs)
  // IF get_resume → TRUE: resume branch, FALSE: next check
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "get_resume" }] } },
    id: "hj-05a", name: "IF: get_resume", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 300] },

  // IF applied → TRUE: log branch, FALSE: next check
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "applied" }] } },
    id: "hj-05b", name: "IF: applied", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 500] },

  // IF mark_outcome → TRUE: outcome branch, FALSE: next check
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "mark_outcome" }] } },
    id: "hj-05c", name: "IF: mark_outcome", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 700] },

  // IF status → TRUE: status branch, FALSE: split + send response (covers all other intents)
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "status" }] } },
    id: "hj-05d", name: "IF: status", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 900] },

  // Split long messages before sending (Telegram 4096 char limit)
  codeNode("hj-05e", "Split: Long Message", CODE_SPLIT_MESSAGE, 1350, 1100),

  // Shared response sender — covers analyze_job, cover_letter, interview_prep, skill_gap, company_info, compare_jobs, general
  telegramSend("hj-06", "Send: Response", 1550, 1100),

  // get_resume branch
  codeNode("hj-07", "Prep: Resume Build", CODE_PREP_RESUME, 1500, 260),

  // Short-circuit: if no job was analyzed yet, send error and stop
  { parameters: { conditions: { boolean: [{ value1: "={{ !!$json.noJob }}", value2: true }] } },
    id: "hj-07b", name: "IF: no job context", type: "n8n-nodes-base.if", typeVersion: 1, position: [1750, 200] },
  telegramSend("hj-07c", "Send: No Job Error", 2000, 140),

  codeNode("hj-08", "Execute: Build Resume DOCX", `
const { execSync } = require('child_process');
const rawCmd = $json.buildCmd;
let buildStdout = '', buildStderr = '', nodeFound = false;

// Find actual node binary first
let nodeBin = 'node';
try { nodeBin = execSync('which node || which nodejs', { timeout: 5000 }).toString().trim().split('\\n')[0]; } catch(e) {}

const candidates = [nodeBin, 'node', '/usr/local/bin/node', '/usr/bin/node', '/usr/bin/nodejs',
  '/home/ubuntu/.nvm/current/bin/node', '/home/ubuntu/.nvm/versions/node/v18/bin/node',
  '/home/ubuntu/.nvm/versions/node/v20/bin/node', '/home/ubuntu/.nvm/versions/node/v22/bin/node'];

for (const bin of [...new Set(candidates)]) {
  const cmd = rawCmd.replace(/^node /, '"' + bin + '" ');
  try {
    buildStdout = execSync(cmd, { timeout: 60000, cwd: '/home/ubuntu/job-scripts' }).toString();
    nodeFound = true;
    break;
  } catch(e) {
    buildStderr = (e.stderr?.toString() || e.message || '').slice(0, 600);
  }
}
return [{ json: { ...$json, buildStdout, buildStderr, nodeFound } }];
`.trim(), 1750, 260),

  codeNode("hj-08b", "Execute: Convert to PDF", `
const { execSync } = require('child_process');
const outputPath = $('Prep: Resume Build').item.json.outputPath;
try {
  execSync('libreoffice --headless --convert-to pdf "' + outputPath + '" --outdir /home/ubuntu/n8n-files/', { timeout: 60000 });
} catch(e) { /* LibreOffice not installed — skip */ }
return [{ json: { ...$json } }];
`.trim(), 2000, 140),

  // IF: resume build succeeded
  {
    parameters: {
      conditions: { boolean: [{ value1: "={{ $json.nodeFound && $json.buildStdout.trim().length > 0 }}", value2: true }] },
    },
    id: "hj-08c", name: "IF: build success",
    type: "n8n-nodes-base.if", typeVersion: 1,
    position: [2000, 260], onError: "continueRegularOutput",
  },
  codeNode("hj-08d", "Format: Build Error", `
const chatId = $('Prep: Resume Build').item.json.chatId;
const err = ($json.buildStderr || 'Unknown error').slice(0, 200);
const nodeMsg = $json.nodeFound ? '' : '\\n⚠️ Node.js binary not found on server.';
return [{ json: { chatId, text: '❌ Resume build failed.' + nodeMsg + '\\n\\nError: ' + err + '\\n\\nCheck that \`build_resume_dynamic.js\` and \`docx\` package are installed on the server.' } }];
`.trim(), 2250, 140),
  telegramSend("hj-08e", "Send: Build Error", 2500, 140),

  {
    parameters: { filePath: "={{ $('Prep: Resume Build').item.json.outputPath }}" },
    id: "hj-09", name: "Read: Resume DOCX",
    type: "n8n-nodes-base.readBinaryFile", typeVersion: 1,
    position: [2250, 320], onError: "continueRegularOutput",
  },

  {
    parameters: { filePath: "={{ $('Prep: Resume Build').item.json.pdfPath }}" },
    id: "hj-09b", name: "Read: Resume PDF",
    type: "n8n-nodes-base.readBinaryFile", typeVersion: 1,
    position: [2250, 140], onError: "continueRegularOutput",
  },

  {
    parameters: {
      operation: "sendDocument",
      chatId: "={{ $('Prep: Resume Build').item.json.chatId }}",
      binaryData: true, binaryPropertyName: "data",
      additionalFields: { caption: "={{ $('Prep: Resume Build').item.json.company }} — Tailored Resume 📄" },
    },
    id: "hj-10", name: "Send: DOCX File",
    type: "n8n-nodes-base.telegram", typeVersion: 1,
    position: [2250, 300], credentials: { telegramApi: TELEGRAM_CRED },
    onError: "continueRegularOutput",
  },

  {
    parameters: {
      operation: "sendDocument",
      chatId: "={{ $('Prep: Resume Build').item.json.chatId }}",
      binaryData: true, binaryPropertyName: "data",
      additionalFields: { caption: "={{ $('Prep: Resume Build').item.json.company }} — Tailored Resume PDF 📄" },
    },
    id: "hj-10b", name: "Send: PDF File",
    type: "n8n-nodes-base.telegram", typeVersion: 1,
    position: [2500, 140], credentials: { telegramApi: TELEGRAM_CRED },
    onError: "continueRegularOutput",
  },

  codeNode("hj-11", "Format: Resume Message", CODE_RESUME_MESSAGE, 2500, 300),
  telegramSend("hj-12", "Send: Resume Summary", 2750, 300),

  // 2 — applied branch
  codeNode("hj-13", "Process: Log Applied", CODE_LOG_APPLIED, 1500, 440),
  {
    parameters: {
      operation: "append",
      documentId: { __rl: true, value: GOOGLE_SHEET_ID, mode: "id" },
      sheetName:  { __rl: true, value: "Applications", mode: "name" },
      dataMode: "autoMapInputData",
      options: {},
    },
    id: "hj-14", name: "Sheets: Log Application",
    type: "n8n-nodes-base.googleSheets", typeVersion: 4,
    position: [1750, 440], credentials: { googleSheetsOAuth2Api: GOOGLE_SHEETS_CRED },
    onError: "continueRegularOutput",
  },
  // Restore chatId + text after Sheets node wipes $json
  codeNode("hj-14b", "Restore: Applied Data", CODE_RESTORE_APPLIED, 2000, 440),
  telegramSend("hj-15", "Send: Applied Confirmation", 2250, 440),

  // 3 — status branch
  codeNode("hj-16", "Build: Status Report", CODE_STATUS, 1500, 580),
  telegramSend("hj-17", "Send: Status", 1750, 580),

  // cover_letter, interview_prep, skill_gap, analyze_job, general — all handled by shared "Send: Response" node

  // 7 — mark_outcome
  codeNode("hj-34", "Process: Mark Outcome", CODE_MARK_OUTCOME, 1500, 1060),
  {
    parameters: {
      operation: "append",
      documentId: { __rl: true, value: GOOGLE_SHEET_ID, mode: "id" },
      sheetName:  { __rl: true, value: "Outcomes", mode: "name" },
      dataMode: "autoMapInputData",
      options: {},
    },
    id: "hj-34b", name: "Sheets: Log Outcome",
    type: "n8n-nodes-base.googleSheets", typeVersion: 4,
    position: [1750, 1060], credentials: { googleSheetsOAuth2Api: GOOGLE_SHEETS_CRED },
    onError: "continueRegularOutput",
  },
  // Restore chatId + text after Sheets node wipes $json
  codeNode("hj-34c", "Restore: Outcome Data", CODE_RESTORE_OUTCOME, 2000, 1060),
  telegramSend("hj-35", "Send: Outcome Confirmed", 2250, 1060),


  // ── CHECK_EMAILS BRANCH ──────────────────────────────────────────────────────
  // On-demand Gmail scan triggered by Telegram message

  // IF: check_emails (inserted between IF: status FALSE and Split: Long Message)
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "check_emails" }] } },
    id: "hj-ce1", name: "IF: check_emails", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 1100] },

  codeNode("hj-ce2", "Build: Email Query", CODE_BUILD_EMAIL_QUERY, 1500, 1220),

  // Send scanning confirmation immediately (Claude's short response / scanningMsg)
  {
    parameters: {
      chatId: "={{ $json.chatId }}",
      text:   "={{ $json.scanningMsg }}",
      additionalFields: { parse_mode: "Markdown", disable_web_page_preview: true },
    },
    id: "hj-ce3", name: "Send: Scanning...",
    type: "n8n-nodes-base.telegram", typeVersion: 1, position: [1750, 1220],
    credentials: { telegramApi: TELEGRAM_CRED },
    onError: "continueRegularOutput",
  },

  // Gmail: search inbox with constructed query
  {
    parameters: {
      resource:  "message",
      operation: "getAll",
      returnAll: false,
      limit:     30,
      filters: { q: "={{ $('Build: Email Query').item.json.gmailQuery }}" },
      options: {},
    },
    id: "hj-ce4", name: "Gmail: Search Inbox",
    type: "n8n-nodes-base.gmail", typeVersion: 2,
    position: [2000, 1220],
    credentials: { gmailOAuth2: GMAIL_CRED },
    onError: "continueRegularOutput",
  },

  // Score & format — $itemIndex guard inside code ensures single output
  codeNode("hj-ce5", "Score & Format Emails", CODE_SCORE_EMAILS, 2250, 1220),

  telegramSend("hj-ce6", "Send: Scan Results", 2500, 1220),

  // ── GMAIL AUTO-INTAKE ────────────────────────────────────────────────────────
  // Polls every 5 min — filters job emails → Claude scores → Telegram alert

  {
    parameters: {
      pollTimes: { item: [{ mode: "everyMinutes", value: 5 }] },
      filters:   {},
      options:   {},
    },
    id: "hj-g1", name: "Gmail Trigger: Job Emails",
    type: "n8n-nodes-base.gmailTrigger", typeVersion: 1,
    position: [200, 1260],
    credentials: { gmailOAuth2: GMAIL_CRED },
  },

  codeNode("hj-g2", "Filter: Is Job Email?", CODE_FILTER_JOB_EMAIL, 450, 1260),

  {
    parameters: {
      method: "POST", url: "https://api.anthropic.com/v1/messages",
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: "x-api-key",         value: ANTHROPIC_API_KEY },
        { name: "anthropic-version", value: "2023-06-01" },
        { name: "content-type",      value: "application/json" },
      ]},
      sendBody: true, contentType: "raw", rawContentType: "application/json",
      body: `={{ $json.claudeBody }}`,
      options: {},
    },
    id: "hj-g3", name: "Claude: Analyze Job Email",
    type: "n8n-nodes-base.httpRequest", typeVersion: 4,
    position: [700, 1260], onError: "continueRegularOutput",
  },

  codeNode("hj-g4", "Parse: Gmail Job Response", CODE_PARSE_GMAIL_JOB, 950, 1260),
  telegramSend("hj-g5", "Send: Job Alert", 1200, 1260),

  // ── SCHEDULED TRIGGERS ──────────────────────────────────────────────────────
  // All times in UTC (PST = UTC-8, PDT = UTC-7)
  // 7 AM PST  = 15:00 UTC
  // 8 PM PST  = 04:00 UTC (next day)
  // 9 AM PST  = 17:00 UTC
  // 10 AM PST Sunday = 18:00 UTC Sunday

  scheduleNode("hj-s1", "Schedule: Morning Briefing",  "0 15 * * *",   200, 600),
  codeNode    ("hj-s2", "Run: Morning Briefing",  CODE_MORNING_BRIEFING,  450, 600),
  telegramSend("hj-s3", "Send: Morning Briefing", 700, 600),

  scheduleNode("hj-s4", "Schedule: Evening Summary",   "0 4 * * *",    200, 760),
  codeNode    ("hj-s5", "Run: Evening Summary",  CODE_EVENING_SUMMARY,   450, 760),
  telegramSend("hj-s6", "Send: Evening Summary", 700, 760),

  scheduleNode("hj-s7", "Schedule: Follow-up Check",   "0 17 * * *",   200, 920),
  codeNode    ("hj-s8", "Run: Follow-up Check",  CODE_FOLLOWUP_CHECKER,  450, 920),
  telegramSend("hj-s9", "Send: Follow-up Reminder", 700, 920),

  scheduleNode("hj-s10", "Schedule: Weekly Review",    "0 18 * * 0",   200, 1080),
  codeNode    ("hj-s11", "Run: Weekly Review",   CODE_WEEKLY_REVIEW,     450, 1080),

  // Phase 2G: Claude-powered coaching (replaces direct Telegram send)
  {
    parameters: {
      method: "POST", url: "https://api.anthropic.com/v1/messages",
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: "x-api-key",         value: ANTHROPIC_API_KEY },
        { name: "anthropic-version", value: "2023-06-01" },
        { name: "content-type",      value: "application/json" },
      ]},
      sendBody: true, contentType: "raw", rawContentType: "application/json",
      body: `={{ $json.claudeBody }}`,
      options: {},
    },
    id: "hj-s13", name: "Claude: Weekly Coach",
    type: "n8n-nodes-base.httpRequest", typeVersion: 4,
    position: [700, 1080], onError: "continueRegularOutput",
  },
  codeNode    ("hj-s14", "Parse: Coach Response", CODE_PARSE_COACH,     950, 1080),
  telegramSend("hj-s12", "Send: Weekly Review",  1200, 1080),

  // ── NEW INTENT BRANCHES ──────────────────────────────────────────────────────

  // search_apps branch
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "search_apps" }] } },
    id: "hj-sa1", name: "IF: search_apps", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 1300] },
  codeNode("hj-sa2", "Build: App Search Results", CODE_SEARCH_APPS, 1500, 1400),
  telegramSend("hj-sa3", "Send: App Search", 1750, 1400),

  // pause_mode branch
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "pause_mode" }] } },
    id: "hj-pm1", name: "IF: pause_mode", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 1500] },
  codeNode("hj-pm2", "Process: Pause Mode", CODE_PAUSE_MODE, 1500, 1580),
  telegramSend("hj-pm3", "Send: Pause Confirm", 1750, 1580),

  // set_preferences branch
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "set_preferences" }] } },
    id: "hj-sp1", name: "IF: set_preferences", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 1700] },
  codeNode("hj-sp2", "Process: Preferences", CODE_SET_PREFERENCES, 1500, 1780),
  telegramSend("hj-sp3", "Send: Prefs Confirm", 1750, 1780),

  // log_recruiter branch
  { parameters: { conditions: { string: [{ value1: "={{ $json.intent }}", value2: "log_recruiter" }] } },
    id: "hj-rc1", name: "IF: log_recruiter", type: "n8n-nodes-base.if", typeVersion: 1, position: [1200, 1900] },
  codeNode("hj-rc2", "Process: Recruiter", CODE_LOG_RECRUITER, 1500, 1980),

  // IF: show only (no Sheets write needed for "show recruiters")
  { parameters: { conditions: { boolean: [{ value1: "={{ !!$json.showOnly }}", value2: true }] } },
    id: "hj-rc3", name: "IF: recruiter show only", type: "n8n-nodes-base.if", typeVersion: 1, position: [1750, 1980] },
  telegramSend("hj-rc4", "Send: Recruiter List", 2000, 1900),

  {
    parameters: {
      operation: "append",
      documentId: { __rl: true, value: GOOGLE_SHEET_ID, mode: "id" },
      sheetName:  { __rl: true, value: "Recruiters", mode: "name" },
      dataMode: "autoMapInputData",
      options: {},
    },
    id: "hj-rc5", name: "Sheets: Log Recruiter",
    type: "n8n-nodes-base.googleSheets", typeVersion: 4,
    position: [2000, 2060], credentials: { googleSheetsOAuth2Api: GOOGLE_SHEETS_CRED },
    onError: "continueRegularOutput",
  },
  codeNode("hj-rc6", "Restore: Recruiter Data", CODE_RESTORE_RECRUITER, 2250, 2060),
  telegramSend("hj-rc7", "Send: Recruiter Confirm", 2500, 2060),
];

// ── Connections ───────────────────────────────────────────────────────────────
const connections = {
  // Telegram webhook path
  "Telegram Trigger":          { main: [[{ node: "Process Message",           type: "main", index: 0 }]] },
  "Process Message":           { main: [[{ node: "Claude: Intent + Response", type: "main", index: 0 }]] },
  "Claude: Intent + Response": { main: [[{ node: "Parse Claude Response",     type: "main", index: 0 }]] },
  "Parse Claude Response": { main: [[{ node: "IF: get_resume", type: "main", index: 0 }]] },

  // IF chain routing
  "IF: get_resume":  { main: [
    [{ node: "Prep: Resume Build",   type: "main", index: 0 }],  // TRUE
    [{ node: "IF: applied",          type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: applied": { main: [
    [{ node: "Process: Log Applied", type: "main", index: 0 }],  // TRUE
    [{ node: "IF: mark_outcome",     type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: mark_outcome": { main: [
    [{ node: "Process: Mark Outcome",type: "main", index: 0 }],  // TRUE
    [{ node: "IF: status",           type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: status": { main: [
    [{ node: "Build: Status Report",  type: "main", index: 0 }],  // TRUE
    [{ node: "IF: check_emails",      type: "main", index: 0 }],  // FALSE → next check
  ]},
  "IF: check_emails": { main: [
    [{ node: "Build: Email Query",    type: "main", index: 0 }],  // TRUE → gmail scan
    [{ node: "IF: search_apps",       type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: search_apps": { main: [
    [{ node: "Build: App Search Results", type: "main", index: 0 }],  // TRUE
    [{ node: "IF: pause_mode",            type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: pause_mode": { main: [
    [{ node: "Process: Pause Mode",   type: "main", index: 0 }],  // TRUE
    [{ node: "IF: set_preferences",   type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: set_preferences": { main: [
    [{ node: "Process: Preferences",  type: "main", index: 0 }],  // TRUE
    [{ node: "IF: log_recruiter",     type: "main", index: 0 }],  // FALSE → next
  ]},
  "IF: log_recruiter": { main: [
    [{ node: "Process: Recruiter",    type: "main", index: 0 }],  // TRUE
    [{ node: "Split: Long Message",   type: "main", index: 0 }],  // FALSE → split then send
  ]},
  "Split: Long Message": { main: [[{ node: "Send: Response", type: "main", index: 0 }]] },

  // check_emails branch
  "Build: Email Query":    { main: [[{ node: "Send: Scanning...",      type: "main", index: 0 }]] },
  "Send: Scanning...":     { main: [[{ node: "Gmail: Search Inbox",    type: "main", index: 0 }]] },
  "Gmail: Search Inbox":   { main: [[{ node: "Score & Format Emails",  type: "main", index: 0 }]] },
  "Score & Format Emails": { main: [[{ node: "Send: Scan Results",     type: "main", index: 0 }]] },

  // search_apps branch
  "Build: App Search Results": { main: [[{ node: "Send: App Search", type: "main", index: 0 }]] },

  // pause_mode branch
  "Process: Pause Mode":   { main: [[{ node: "Send: Pause Confirm",   type: "main", index: 0 }]] },

  // set_preferences branch
  "Process: Preferences":  { main: [[{ node: "Send: Prefs Confirm",   type: "main", index: 0 }]] },

  // recruiter branch — show path skips Sheets, log path goes to Sheets
  "Process: Recruiter":         { main: [[{ node: "IF: recruiter show only", type: "main", index: 0 }]] },
  "IF: recruiter show only": { main: [
    [{ node: "Send: Recruiter List",    type: "main", index: 0 }],  // TRUE → show only, no Sheets
    [{ node: "Sheets: Log Recruiter",   type: "main", index: 0 }],  // FALSE → log to Sheets
  ]},
  "Sheets: Log Recruiter":   { main: [[{ node: "Restore: Recruiter Data",  type: "main", index: 0 }]] },
  "Restore: Recruiter Data": { main: [[{ node: "Send: Recruiter Confirm",  type: "main", index: 0 }]] },

  // Resume branch: check job context → DOCX build → fanout to PDF path + DOCX read path
  "Prep: Resume Build":     { main: [[{ node: "IF: no job context",       type: "main", index: 0 }]] },
  "IF: no job context": { main: [
    [{ node: "Send: No Job Error",      type: "main", index: 0 }],  // TRUE → no job, send error
    [{ node: "Execute: Build Resume DOCX", type: "main", index: 0 }],  // FALSE → build it
  ]},
  "Execute: Build Resume DOCX": { main: [[{ node: "IF: build success", type: "main", index: 0 }]] },
  "IF: build success": { main: [
    [{ node: "Format: Build Error",    type: "main", index: 0 }],  // FALSE → build failed
    [                                                               // TRUE → success
      { node: "Execute: Convert to PDF", type: "main", index: 0 },
      { node: "Read: Resume DOCX",       type: "main", index: 0 },
    ],
  ]},
  "Format: Build Error":        { main: [[{ node: "Send: Build Error",     type: "main", index: 0 }]] },
  "Execute: Convert to PDF":    { main: [[{ node: "Read: Resume PDF",      type: "main", index: 0 }]] },
  "Read: Resume PDF":           { main: [[{ node: "Send: PDF File",         type: "main", index: 0 }]] },
  "Read: Resume DOCX":          { main: [[
    { node: "Send: DOCX File",        type: "main", index: 0 },
    { node: "Format: Resume Message", type: "main", index: 0 },
  ]]},
  "Format: Resume Message":     { main: [[{ node: "Send: Resume Summary",   type: "main", index: 0 }]] },

  // Applied branch — Sheets wipes $json so restore node passes chatId+text back to Telegram
  "Process: Log Applied":       { main: [[{ node: "Sheets: Log Application",    type: "main", index: 0 }]] },
  "Sheets: Log Application":    { main: [[{ node: "Restore: Applied Data",      type: "main", index: 0 }]] },
  "Restore: Applied Data":      { main: [[{ node: "Send: Applied Confirmation", type: "main", index: 0 }]] },

  // Status branch
  "Build: Status Report":       { main: [[{ node: "Send: Status",               type: "main", index: 0 }]] },

  // Mark outcome branch — same Sheets data restore fix
  "Process: Mark Outcome":  { main: [[{ node: "Sheets: Log Outcome",        type: "main", index: 0 }]] },
  "Sheets: Log Outcome":    { main: [[{ node: "Restore: Outcome Data",      type: "main", index: 0 }]] },
  "Restore: Outcome Data":  { main: [[{ node: "Send: Outcome Confirmed",    type: "main", index: 0 }]] },

  // Gmail auto-intake path
  "Gmail Trigger: Job Emails": { main: [[{ node: "Filter: Is Job Email?",      type: "main", index: 0 }]] },
  "Filter: Is Job Email?":     { main: [[{ node: "Claude: Analyze Job Email",  type: "main", index: 0 }]] },
  "Claude: Analyze Job Email": { main: [[{ node: "Parse: Gmail Job Response",  type: "main", index: 0 }]] },
  "Parse: Gmail Job Response": { main: [[{ node: "Send: Job Alert",            type: "main", index: 0 }]] },

  // Scheduled paths
  "Schedule: Morning Briefing": { main: [[{ node: "Run: Morning Briefing",   type: "main", index: 0 }]] },
  "Run: Morning Briefing":      { main: [[{ node: "Send: Morning Briefing",  type: "main", index: 0 }]] },

  "Schedule: Evening Summary":  { main: [[{ node: "Run: Evening Summary",    type: "main", index: 0 }]] },
  "Run: Evening Summary":       { main: [[{ node: "Send: Evening Summary",   type: "main", index: 0 }]] },

  "Schedule: Follow-up Check":  { main: [[{ node: "Run: Follow-up Check",   type: "main", index: 0 }]] },
  "Run: Follow-up Check":       { main: [[{ node: "Send: Follow-up Reminder", type: "main", index: 0 }]] },

  "Schedule: Weekly Review":    { main: [[{ node: "Run: Weekly Review",      type: "main", index: 0 }]] },
  "Run: Weekly Review":         { main: [[{ node: "Claude: Weekly Coach",    type: "main", index: 0 }]] },
  "Claude: Weekly Coach":       { main: [[{ node: "Parse: Coach Response",   type: "main", index: 0 }]] },
  "Parse: Coach Response":      { main: [[{ node: "Send: Weekly Review",     type: "main", index: 0 }]] },
};

// ── Assemble + write ──────────────────────────────────────────────────────────
const workflow = {
  name: "HarryJobBuddy — AI Career OS v2",
  nodes,
  connections,
  active: false,
  settings: { timezone: "America/Los_Angeles", executionOrder: "v1" },
};

const outDir  = path.join(__dirname, 'workflows');
const outFile = path.join(outDir, 'harryjobbuddy.json');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(workflow, null, 2));

console.log(`✅  Written: ${outFile}`);
console.log(`    Nodes: ${nodes.length}`);
console.log('');
console.log('WHAT\'S NEW IN v2.0:');
console.log('  + Gmail auto-intake (every 5 min, job emails → scored alert)');
console.log('  + Cover letter generation ("write cover letter for this job")');
console.log('  + Interview prep ("prepare me for interview")');
console.log('  + Skill gap analysis ("what skills am I missing")');
console.log('  + Outcome tracking ("got interview at X", "rejected by X")');
console.log('  + PDF resume via LibreOffice (optional, silently skips if not installed)');
console.log('  + ATS score + missing_skills in every job analysis');
console.log('  + Bug fix: Claude response nodes now correctly send the right field');
console.log('');
console.log('NEW CREDENTIALS NEEDED:');
console.log('  - Gmail OAuth2 (for Gmail Trigger node)');
console.log('');
console.log('TO ENABLE PDF:');
console.log('  sudo apt-get install -y libreoffice-headless  # on server');
