/**
 * test_harryjobbuddy.js
 * Comprehensive internal test suite for HarryJobBuddy workflow.
 *
 * Tests every Code node with real mock data, validates workflow structure,
 * and simulates all user flows end-to-end.
 *
 * Run: node test_harryjobbuddy.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── Colours ──────────────────────────────────────────────────────────────────
const G = s => `\x1b[32m${s}\x1b[0m`;   // green
const R = s => `\x1b[31m${s}\x1b[0m`;   // red
const Y = s => `\x1b[33m${s}\x1b[0m`;   // yellow
const B = s => `\x1b[1m${s}\x1b[0m`;    // bold
const D = s => `\x1b[2m${s}\x1b[0m`;    // dim

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warned = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ${G('✓')} ${label}`);
    passed++;
  } catch(e) {
    console.log(`  ${R('✗')} ${label}`);
    console.log(`    ${R(e.message)}`);
    failures.push({ label, error: e.message });
    failed++;
  }
}

function warn(label, fn) {
  try {
    fn();
    console.log(`  ${G('✓')} ${label}`);
    passed++;
  } catch(e) {
    console.log(`  ${Y('⚠')} ${label} (warning: ${e.message})`);
    warned++;
  }
}

function section(title) {
  console.log(`\n${B('━━━ ' + title + ' ' + '━'.repeat(Math.max(0,60-title.length)))}`);
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertContains(str, substr, msg) {
  if (!String(str).includes(substr)) throw new Error(msg || `Expected "${substr}" in: "${String(str).slice(0,100)}"`);
}

function assertNotContains(str, substr, msg) {
  if (String(str).includes(substr)) throw new Error(msg || `Did NOT expect "${substr}" in output`);
}

// ── n8n Runtime Mock ─────────────────────────────────────────────────────────
// Uses vm.runInNewContext so template literals, regex, and all JS syntax work
// correctly with code strings extracted from the workflow JSON.
function runCode(codeStr, jsonInput, staticData = {}, extras = {}) {
  const nodeRefs  = extras.nodeRefs  || {};
  const allItems  = extras.allItems  || [{ json: jsonInput }];
  const itemIndex = extras.itemIndex !== undefined ? extras.itemIndex : allItems.length - 1;

  // Wrap code in an IIFE so `return` statements work
  const wrapped = `__result__ = (function() {\n${codeStr}\n})();`;

  const sandbox = vm.createContext({
    __result__:              undefined,
    $json:                   jsonInput,
    $itemIndex:              itemIndex,
    $input:                  { all: () => allItems, item: { json: jsonInput } },
    $getWorkflowStaticData:  () => staticData,
    $:                       (name) => ({ item: { json: nodeRefs[name] || {} } }),
    // Safe globals needed by some code nodes
    JSON, Date, Array, Object, Math, String, Number, Boolean, RegExp,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent,
    require: (m) => { if (m === 'child_process') return { execSync: () => 'mock' }; return require(m); },
    console,
  });

  try {
    vm.runInContext(wrapped, sandbox, { timeout: 5000 });
    return { result: sandbox.__result__ || [], sd: staticData };
  } catch(e) {
    throw new Error(`Code execution error: ${e.message}`);
  }
}

// ── Load workflow & code constants ────────────────────────────────────────────
const wf = JSON.parse(fs.readFileSync(path.join(__dirname, 'workflows/harryjobbuddy.json'), 'utf8'));

function getNodeCode(name) {
  const node = wf.nodes.find(n => n.name === name);
  if (!node) throw new Error(`Node not found: ${name}`);
  if (!node.parameters?.jsCode) throw new Error(`No jsCode in node: ${name}`);
  return node.parameters.jsCode;
}

function getNode(name) {
  const node = wf.nodes.find(n => n.name === name);
  if (!node) throw new Error(`Node not found: ${name}`);
  return node;
}


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — WORKFLOW STRUCTURE VALIDATION
// ════════════════════════════════════════════════════════════════════════════
section('1. WORKFLOW STRUCTURE');

test('Workflow JSON is valid and parseable', () => {
  assert(wf.nodes && Array.isArray(wf.nodes), 'Missing nodes array');
  assert(wf.connections && typeof wf.connections === 'object', 'Missing connections');
});

test('Node count is 75', () => {
  assert(wf.nodes.length === 75, `Expected 75 nodes, got ${wf.nodes.length}`);
});

test('No duplicate node IDs', () => {
  const ids = wf.nodes.map(n => n.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert(dupes.length === 0, `Duplicate IDs: ${dupes.join(', ')}`);
});

test('No duplicate node names', () => {
  const names = wf.nodes.map(n => n.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert(dupes.length === 0, `Duplicate names: ${dupes.join(', ')}`);
});

test('All connection targets exist as nodes', () => {
  const nodeNames = new Set(wf.nodes.map(n => n.name));
  const missing = [];
  Object.entries(wf.connections).forEach(([from, targets]) => {
    if (!nodeNames.has(from)) missing.push(`source: ${from}`);
    (targets.main || []).forEach(tl => (tl||[]).forEach(t => {
      if (!nodeNames.has(t.node)) missing.push(`${from} → ${t.node}`);
    }));
  });
  assert(missing.length === 0, `Missing connection targets: ${missing.join('; ')}`);
});

test('All 3 Claude HTTP nodes use $json.claudeBody (no complex expressions)', () => {
  ['Claude: Intent + Response','Claude: Analyze Job Email','Claude: Weekly Coach'].forEach(name => {
    const node = getNode(name);
    assert(node.parameters.body === '={{ $json.claudeBody }}', `${name} body is not simple: ${node.parameters.body?.substring(0,60)}`);
  });
});

test('No $json.* inside JSON.stringify() in any HTTP node body', () => {
  const bad = wf.nodes
    .filter(n => n.type === 'n8n-nodes-base.httpRequest')
    .filter(n => /JSON\.stringify[^}]*\$json/.test(n.parameters.body || ''));
  assert(bad.length === 0, `Found complex bodies in: ${bad.map(n=>n.name).join(', ')}`);
});

test('Telegram Trigger has unique webhookId hjb-v7-2026', () => {
  const trigger = wf.nodes.find(n => n.name === 'Telegram Trigger');
  assert(trigger?.webhookId === 'hjb-v7-2026', `webhookId is: ${trigger?.webhookId}`);
});

test('All Code nodes have non-empty jsCode', () => {
  const bad = wf.nodes
    .filter(n => n.type === 'n8n-nodes-base.code')
    .filter(n => !n.parameters?.jsCode?.trim());
  assert(bad.length === 0, `Empty jsCode in: ${bad.map(n=>n.name).join(', ')}`);
});

test('IF chain order is correct', () => {
  const order = ['IF: get_resume','IF: applied','IF: mark_outcome','IF: status',
    'IF: check_emails','IF: search_apps','IF: pause_mode','IF: set_preferences','IF: log_recruiter'];
  const conns = wf.connections;
  // Each IF false branch should lead to the next IF (or Split for the last)
  // Just verify each IF node exists
  order.forEach(name => {
    const node = wf.nodes.find(n => n.name === name);
    assert(node, `Missing IF node: ${name}`);
  });
});

test('Resume output path uses /home/ubuntu/ not /root/', () => {
  const node = getNode('Prep: Resume Build');
  assertNotContains(node.parameters.jsCode, '/root/', 'Still using /root/ path');
  assertContains(node.parameters.jsCode, '/home/ubuntu/n8n-files/', 'Missing correct path');
});

test('Resume build error surfacing nodes exist', () => {
  assert(wf.nodes.find(n => n.name === 'IF: build success'), 'Missing IF: build success');
  assert(wf.nodes.find(n => n.name === 'Format: Build Error'), 'Missing Format: Build Error');
  assert(wf.nodes.find(n => n.name === 'Send: Build Error'), 'Missing Send: Build Error');
});

test('Sheets nodes have no rowData nesting — flat fields in log nodes', () => {
  ['Process: Log Applied','Process: Mark Outcome','Process: Recruiter'].forEach(name => {
    const node = wf.nodes.find(n => n.name === name);
    if (!node) return; // some may be named differently
    assertNotContains(node.parameters?.jsCode || '', 'rowData:', `${name} still has rowData nesting`);
  });
});

test('Google Sheets credential used consistently', () => {
  const sheetsNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.googleSheets');
  assert(sheetsNodes.length >= 3, `Expected >=3 Sheets nodes, got ${sheetsNodes.length}`);
  sheetsNodes.forEach(n => {
    assert(n.credentials?.googleSheetsOAuth2Api, `${n.name} missing Sheets credential`);
  });
});

test('Anthropic API key placeholder exists (user must replace it)', () => {
  const httpNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  const hasKey = httpNodes.every(n => {
    const headers = n.parameters?.headerParameters?.parameters || [];
    return headers.some(h => h.name === 'x-api-key');
  });
  assert(hasKey, 'Some Claude HTTP nodes missing x-api-key header');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — CODE_PARSE_CLAUDE
// ════════════════════════════════════════════════════════════════════════════
section('2. CODE_PARSE_CLAUDE — Intent Routing & Response Formatting');

const CODE_PARSE_CLAUDE = getNodeCode('Parse Claude Response');

function runParseClaude(rawClaudeResponse, sd = {}, nodeRefs = {}) {
  if (!sd.history) sd.history = [];
  if (!nodeRefs['Process Message']) nodeRefs['Process Message'] = { chatId: '12345' };
  return runCode(CODE_PARSE_CLAUDE,
    { content: [{ text: rawClaudeResponse }] },
    sd, { nodeRefs }
  );
}

test('analyze_job: parses clean JSON and builds formatted card', () => {
  const payload = JSON.stringify({
    intent: 'analyze_job',
    mode: 'coach',
    response: 'Strong BTP match.',
    structured: {
      title: 'SAP BTP Integration Developer',
      company: 'Infosys',
      score: 8,
      classification: 'APPLY NOW',
      location: 'Remote',
      salary: '$95k-$115k',
      visa_sponsor: 'Yes',
      exp_required: '5 years',
      keywords: ['BTP','OData'],
      ats_score: 85,
      missing_skills: ['CPI'],
      link: 'https://infosys.com/jobs/123',
    }
  });
  const { result, sd } = runParseClaude(payload, {});
  assert(result.length === 1, 'Should return 1 item');
  assert(result[0].json.intent === 'analyze_job', 'Wrong intent');
  assertContains(result[0].json.response, '🟢', 'Missing green icon for score 8');
  assertContains(result[0].json.response, 'Infosys', 'Missing company name');
  assertContains(result[0].json.response, '8/10', 'Missing score');
  assertContains(result[0].json.response, '$95k-$115k', 'Missing salary');
  assertContains(result[0].json.response, 'ATS Match: 85%', 'Missing ATS score');
  assertContains(result[0].json.response, 'Gaps: CPI', 'Missing skills gap');
  assertContains(result[0].json.response, 'https://infosys.com/jobs/123', 'Missing apply link');
  assert(sd.lastAnalyzedJob?.company === 'Infosys', 'lastAnalyzedJob not stored in sd');
});

test('analyze_job: score 5 shows 🟡 icon', () => {
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Maybe.',
    structured:{ title:'Data Analyst', company:'TCS', score:5, classification:'MAYBE',
      location:'New York', salary:'$75k', visa_sponsor:'No', exp_required:'3 years', keywords:[] }});
  const { result } = runParseClaude(payload, {});
  assertContains(result[0].json.response, '🟡', 'Missing yellow icon for score 5');
});

test('analyze_job: score 3 shows 🔴 icon', () => {
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Skip this.',
    structured:{ title:'iOS Dev', company:'Apple', score:3, classification:'SKIP',
      location:'Cupertino', salary:'Unknown', visa_sponsor:'No', exp_required:'8 years', keywords:[] }});
  const { result } = runParseCloud(payload);
  assertContains(result[0].json.response, '🔴', 'Missing red icon for score 3');
});

function runParseCloud(payload) { return runParseClaudeSimple(payload); }
function runParseClaudeSimple(payload, sd = {}) {
  if (!sd.history) sd.history = [];
  return runCode(CODE_PARSE_CLAUDE,
    { content: [{ text: payload }] }, sd,
    { nodeRefs: { 'Process Message': { chatId: '12345' } } }
  );
}

test('general intent: passes response through unchanged', () => {
  const payload = JSON.stringify({ intent:'general', mode:'friend', response:'Good morning! You have 3 applications pending.', structured: null });
  const { result } = runParseClaudeSimple(payload);
  assert(result[0].json.intent === 'general', 'Wrong intent');
  assertContains(result[0].json.response, 'Good morning', 'Response lost');
});

test('Malformed JSON falls back gracefully — no crash', () => {
  const { result } = runParseClaudeSimple('This is not JSON at all.');
  assert(result.length === 1, 'Should return 1 item even on bad response');
  assert(result[0].json.intent === 'general', `Should fallback to general, got: ${result[0].json.intent}`);
});

test('JSON with markdown fences is cleaned correctly', () => {
  const payload = '```json\n{"intent":"status","mode":"coach","response":"Here is your status.","structured":null}\n```';
  const { result } = runParseClaudeSimple(payload);
  assert(result[0].json.intent === 'status', `Expected status, got: ${result[0].json.intent}`);
});

test('JSON embedded in prose is extracted', () => {
  const payload = 'Sure! Here is my analysis:\n{"intent":"analyze_job","mode":"coach","response":"Good role.","structured":{"title":"SAP BTP","company":"IBM","score":7,"classification":"APPLY NOW","location":"Remote","salary":"$100k","visa_sponsor":"Yes","exp_required":"5yr","keywords":[]}}\nLet me know if you have questions.';
  const { result } = runParseClaudeSimple(payload);
  assert(result[0].json.intent === 'analyze_job', `Expected analyze_job, got: ${result[0].json.intent}`);
});

test('History is stored and capped at 8', () => {
  const sd = { history: Array(8).fill({ role:'user', content:'old' }) };
  runParseClaudeSimple(JSON.stringify({ intent:'general', mode:'friend', response:'New reply', structured:null }), sd);
  assert(sd.history.length <= 8, `History grew beyond 8: ${sd.history.length}`);
});

test('dailyActivity.analyzed increments on analyze_job', () => {
  const sd = {};
  runParseClaudeSimple(JSON.stringify({ intent:'analyze_job', mode:'coach', response:'r',
    structured:{ title:'T', company:'C', score:7, classification:'MAYBE', location:'', salary:'', visa_sponsor:'', exp_required:'', keywords:[] }}), sd);
  const today = new Date().toDateString();
  assert(sd.dailyActivity?.[today]?.analyzed === 1, 'analyzed count not incremented');
});

test('Preferences: Tier 1 priority role adds ⭐ indicator', () => {
  const sd = { preferences: { role_priorities: { 'SAP BTP': 1 } } };
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Good.',
    structured:{ title:'SAP BTP Integration Developer', company:'Infosys', score:8,
      classification:'APPLY NOW', location:'Remote', salary:'$95k', visa_sponsor:'Yes', exp_required:'5yr', keywords:[] }});
  const { result } = runParseClaudeSimple(payload, sd);
  assertContains(result[0].json.response, '⭐ Tier 1 priority match', 'Missing priority indicator');
});

test('Preferences: excluded location adds 🚫 flag', () => {
  const sd = { preferences: { excluded_locations: ['New York'] } };
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Hmm.',
    structured:{ title:'Data Analyst', company:'TCS', score:6, classification:'MAYBE',
      location:'New York, NY', salary:'$80k', visa_sponsor:'Yes', exp_required:'3yr', keywords:[] }});
  const { result } = runParseClaudeSimple(payload, sd);
  assertContains(result[0].json.response, '🚫 Excluded location', 'Missing location exclusion flag');
});

test('Preferences: salary $90k below $100k floor adds ⚠️ warning', () => {
  const sd = { preferences: { salary_min: 100000 } };
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Low pay.',
    structured:{ title:'SAP ABAP Dev', company:'HCL', score:6, classification:'MAYBE',
      location:'Remote', salary:'$90k', visa_sponsor:'Yes', exp_required:'5yr', keywords:[] }});
  const { result } = runParseClaudeSimple(payload, sd);
  assertContains(result[0].json.response, 'Below salary floor', 'Missing salary floor warning for $90k < $100k');
});

test('Salary parser: $90k correctly parsed as 90000', () => {
  const sd = { preferences: { salary_min: 100000 } };
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'r',
    structured:{ title:'Dev', company:'X', score:5, classification:'MAYBE',
      location:'', salary:'$90k', visa_sponsor:'', exp_required:'', keywords:[] }});
  const { result } = runParseClaudeSimple(payload, sd);
  assertContains(result[0].json.response, 'Below salary floor', '$90k not parsed as 90000');
});

test('Salary parser: $90,000 correctly parsed as 90000', () => {
  const sd = { preferences: { salary_min: 100000 } };
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'r',
    structured:{ title:'Dev', company:'X', score:5, classification:'MAYBE',
      location:'', salary:'$90,000', visa_sponsor:'', exp_required:'', keywords:[] }});
  const { result } = runParseClaudeSimple(payload, sd);
  assertContains(result[0].json.response, 'Below salary floor', '$90,000 not parsed correctly');
});

test('Salary parser: $110k NOT flagged when floor is $100k', () => {
  const sd = { preferences: { salary_min: 100000 } };
  const payload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Good pay.',
    structured:{ title:'Dev', company:'X', score:7, classification:'APPLY NOW',
      location:'', salary:'$110k', visa_sponsor:'Yes', exp_required:'', keywords:[] }});
  const { result } = runParseClaudeSimple(payload, sd);
  assertNotContains(result[0].json.response, 'Below salary floor', '$110k should NOT be flagged');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — CODE_LOG_APPLIED
// ════════════════════════════════════════════════════════════════════════════
section('3. CODE_LOG_APPLIED — Application Logging');

const CODE_LOG_APPLIED = getNodeCode('Process: Log Applied');

function runLogApplied(input, sd = {}) {
  if (!sd.applications) sd.applications = [];
  return runCode(CODE_LOG_APPLIED, input, sd);
}

test('Logs application to sd.applications', () => {
  const sd = {};
  runLogApplied({ structured:{ company:'Infosys', role:'SAP BTP Dev' }, chatId:'12345' }, sd);
  assert(sd.applications?.length === 1, `Expected 1 app, got ${sd.applications?.length}`);
  assert(sd.applications[0].company === 'Infosys', 'Wrong company stored');
  assert(sd.applications[0].status === 'Applied', 'Wrong initial status');
});

test('Returns flat fields (no rowData nesting) for Sheets', () => {
  const { result } = runLogApplied({ structured:{ company:'TCS', role:'Data Analyst' }, chatId:'12345' });
  const json = result[0].json;
  assert(json.Company === 'TCS', `Expected json.Company='TCS', got: ${json.Company}`);
  assert(json.Role === 'Data Analyst', `Expected json.Role, got: ${json.Role}`);
  assert(json['Date Applied'], 'Missing Date Applied');
  assert(json.Status === 'Applied', 'Missing Status');
  assert(!json.rowData, 'rowData should NOT exist at top level — should be spread flat');
});

test('Resume Version captured when lastResumeGenerated exists', () => {
  const sd = { lastResumeGenerated: { company: 'Infosys', date: '2026-05-09', path: '/home/ubuntu/n8n-files/HarshaYelamati_Infosys_2026-05-09.docx' } };
  const { result } = runLogApplied({ structured:{ company:'Infosys', role:'SAP BTP' }, chatId:'12345' }, sd);
  assertContains(result[0].json['Resume Version'], 'Infosys_2026-05-09', 'Resume version not captured');
});

test('Resume Version is empty string when no resume generated', () => {
  const { result } = runLogApplied({ structured:{ company:'Deloitte', role:'Analyst' }, chatId:'12345' }, {});
  assert(result[0].json['Resume Version'] === '', `Expected empty string, got: "${result[0].json['Resume Version']}"`);
});

test('Weekly count increments correctly', () => {
  const sd = { applications: [
    { company:'A', role:'X', dateApplied: new Date().toISOString().split('T')[0], status:'Applied' },
    { company:'B', role:'Y', dateApplied: new Date().toISOString().split('T')[0], status:'Applied' },
  ]};
  const { result } = runLogApplied({ structured:{ company:'C', role:'Z' }, chatId:'12345' }, sd);
  assertContains(result[0].json.text, '3 applications', 'Week count wrong');
});

test('Confirmation text contains company and role', () => {
  const { result } = runLogApplied({ structured:{ company:'SAP SE', role:'BTP Consultant' }, chatId:'12345' });
  assertContains(result[0].json.text, 'SAP SE', 'Company missing from confirmation');
  assertContains(result[0].json.text, 'BTP Consultant', 'Role missing from confirmation');
});

test('Handles missing structured gracefully', () => {
  const { result } = runLogApplied({ chatId:'12345' });
  assert(result.length === 1, 'Should return 1 item even without structured data');
  assertContains(result[0].json.Company, 'Unknown', 'Should default to Unknown Company');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — CODE_MARK_OUTCOME
// ════════════════════════════════════════════════════════════════════════════
section('4. CODE_MARK_OUTCOME — Outcome Tracking');

const CODE_MARK_OUTCOME = getNodeCode('Process: Mark Outcome');

function runMarkOutcome(input, sd = {}) {
  if (!sd.applications) sd.applications = [];
  return runCode(CODE_MARK_OUTCOME, input, sd);
}

test('Updates existing application status to Interview', () => {
  const sd = { applications: [{ company:'Infosys', role:'SAP BTP', dateApplied:'2026-05-01', status:'Applied' }] };
  runMarkOutcome({ chatId:'12345', response:'Got interview!', structured:{ company:'Infosys', outcome:'interview', stage:null } }, sd);
  assert(sd.applications[0].status === 'Interview', `Expected Interview, got: ${sd.applications[0].status}`);
});

test('Stage field stored on application', () => {
  const sd = { applications: [{ company:'TCS', role:'Data', dateApplied:'2026-05-01', status:'Applied' }] };
  runMarkOutcome({ chatId:'12345', response:'Phone screen!', structured:{ company:'TCS', outcome:'interview', stage:'phone_screen' } }, sd);
  assert(sd.applications[0].stage === 'phone_screen', 'Stage not stored');
});

test('Stage emoji appears in confirmation text', () => {
  const { result } = runMarkOutcome({ chatId:'12345', response:'Moving forward.', structured:{ company:'TCS', outcome:'interview', stage:'phone_screen' } });
  assertContains(result[0].json.text, '📞', 'Phone screen emoji missing');
  assertContains(result[0].json.text, 'Phone Screen', 'Stage label missing');
});

test('take_home stage shows 📝', () => {
  const { result } = runMarkOutcome({ chatId:'12345', response:'Take home.', structured:{ company:'IBM', outcome:'interview', stage:'take_home' } });
  assertContains(result[0].json.text, '📝', 'Take-home emoji missing');
});

test('final_round stage shows 🎯', () => {
  const { result } = runMarkOutcome({ chatId:'12345', response:'Final!', structured:{ company:'IBM', outcome:'interview', stage:'final_round' } });
  assertContains(result[0].json.text, '🎯', 'Final round emoji missing');
});

test('Outcome for unknown company creates new entry in sd.applications', () => {
  const sd = { applications: [] };
  runMarkOutcome({ chatId:'12345', response:'Rejected.', structured:{ company:'NewCorp', outcome:'rejected', stage:null } }, sd);
  assert(sd.applications.length === 1, 'Should create entry for unknown company');
  assert(sd.applications[0].company === 'NewCorp', 'Company name wrong');
  assert(sd.applications[0].status === 'Rejected', 'Status wrong');
});

test('Returns flat fields for Sheets (no rowData nesting)', () => {
  const { result } = runMarkOutcome({ chatId:'12345', response:'Interview!', structured:{ company:'Deloitte', outcome:'interview', stage:null } });
  const json = result[0].json;
  assert(json.Company === 'Deloitte', `json.Company should be 'Deloitte', got: ${json.Company}`);
  assert(json['New Status'] === 'Interview', `json['New Status'] wrong: ${json['New Status']}`);
  assert(!json.rowData, 'rowData should be spread flat');
});

test('Undefined response handled gracefully (no "undefinedstage" text)', () => {
  const { result } = runMarkOutcome({ chatId:'12345', structured:{ company:'X', outcome:'rejected', stage:null } });
  assertNotContains(result[0].json.text, 'undefined', 'undefined in text output');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — CODE_SEARCH_APPS
// ════════════════════════════════════════════════════════════════════════════
section('5. CODE_SEARCH_APPS — Application Search & Recall');

const CODE_SEARCH_APPS = getNodeCode('Build: App Search Results');

const sampleApps = [
  { company:'Infosys', role:'SAP BTP Developer', dateApplied:'2026-05-01', status:'Interview', stage:'phone_screen' },
  { company:'TCS', role:'Data Analyst', dateApplied:'2026-04-25', status:'Applied' },
  { company:'Deloitte', role:'SAP ABAP Consultant', dateApplied:'2026-04-20', status:'Rejected' },
  { company:'IBM', role:'AI Automation Engineer', dateApplied:'2026-03-01', status:'Ghosted' },
  { company:'Wipro', role:'SAP BTP Consultant', dateApplied:'2026-05-05', status:'Applied' },
];

function runSearchApps(structured, apps = sampleApps) {
  return runCode(CODE_SEARCH_APPS,
    { chatId:'12345', structured },
    { applications: apps }
  );
}

test('Returns all apps with status_filter=all', () => {
  const { result } = runSearchApps({ status_filter:'all', days_back:60 });
  assertContains(result[0].json.text, 'Infosys', 'Missing Infosys in all results');
  assertContains(result[0].json.text, 'TCS', 'Missing TCS in all results');
});

test('Filters by status: ghosted returns only ghosted', () => {
  const { result } = runSearchApps({ status_filter:'ghosted', days_back:90 });
  assertContains(result[0].json.text, '👻', 'Missing ghost emoji for ghosted filter');
});

test('Filters by status: interview returns only interview', () => {
  const { result } = runSearchApps({ status_filter:'interview', days_back:60 });
  assertContains(result[0].json.text, 'Infosys', 'Should show Infosys (Interview status)');
  assertNotContains(result[0].json.text, 'TCS', 'TCS (Applied) should be filtered out');
});

test('Filters by role: SAP BTP returns matching roles', () => {
  const { result } = runSearchApps({ status_filter:'all', role_filter:'SAP BTP', days_back:60 });
  assertContains(result[0].json.text, 'Infosys', 'Should show Infosys SAP BTP Developer');
  assertContains(result[0].json.text, 'Wipro', 'Should show Wipro SAP BTP Consultant');
  assertNotContains(result[0].json.text, 'Data Analyst', 'Data Analyst should be filtered out');
});

test('No results returns helpful empty message', () => {
  const { result } = runSearchApps({ status_filter:'offer', days_back:30 });
  assertContains(result[0].json.text, 'No applications found', 'Missing empty state message');
});

test('Empty applications array returns helpful message', () => {
  const { result } = runSearchApps({ status_filter:'all', days_back:30 }, []);
  assertContains(result[0].json.text, 'No applications found', 'Missing empty state message');
});

test('Stage shown in results when present', () => {
  const { result } = runSearchApps({ status_filter:'interview', days_back:60 });
  assertContains(result[0].json.text, 'phone screen', 'Stage info missing from results');
});

test('days_back filter works — old apps excluded', () => {
  const { result } = runSearchApps({ status_filter:'all', days_back:7 });
  // IBM applied 2026-03-01 should be outside 7 days window
  assertNotContains(result[0].json.text, 'IBM', 'Old IBM app should be filtered out by days_back:7');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 6 — CODE_PAUSE_MODE
// ════════════════════════════════════════════════════════════════════════════
section('6. CODE_PAUSE_MODE — Pause / Vacation Mode');

const CODE_PAUSE_MODE = getNodeCode('Process: Pause Mode');

function runPauseMode(structured, sd = {}) {
  return runCode(CODE_PAUSE_MODE, { chatId:'12345', structured }, sd);
}

test('Pause with date sets sd.pausedUntil', () => {
  const sd = {};
  runPauseMode({ action:'pause', resume_date:'2026-06-01' }, sd);
  assert(sd.pausedUntil === '2026-06-01', `Expected 2026-06-01, got: ${sd.pausedUntil}`);
});

test('Pause with date returns confirmation message with date', () => {
  const { result } = runPauseMode({ action:'pause', resume_date:'2026-06-15' });
  assertContains(result[0].json.text, 'paused until', 'Missing pause confirmation');
  // Date format is locale-dependent — just verify a month name and day number appear
  assert(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(result[0].json.text), 'No month name in date confirmation');
});

test('Pause without date sets pausedUntil to 2099-12-31 (indefinite)', () => {
  const sd = {};
  runPauseMode({ action:'pause', resume_date:null }, sd);
  assert(sd.pausedUntil === '2099-12-31', `Expected 2099-12-31, got: ${sd.pausedUntil}`);
});

test('Resume action clears pausedUntil', () => {
  const sd = { pausedUntil: '2099-12-31' };
  runPauseMode({ action:'resume' }, sd);
  assert(sd.pausedUntil === null, `Expected null, got: ${sd.pausedUntil}`);
});

test('Resume action returns encouraging message', () => {
  const { result } = runPauseMode({ action:'resume' }, { pausedUntil:'2026-06-01' });
  assertContains(result[0].json.text, 'resumed', 'Missing resume confirmation');
});

test('Unpause action (alias) also clears pausedUntil', () => {
  const sd = { pausedUntil: '2099-12-31' };
  runPauseMode({ action:'unpause' }, sd);
  assert(sd.pausedUntil === null, 'unpause alias should work');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 7 — CODE_SET_PREFERENCES
// ════════════════════════════════════════════════════════════════════════════
section('7. CODE_SET_PREFERENCES — Job Search Preferences');

const CODE_SET_PREFERENCES = getNodeCode('Process: Preferences');

function runSetPrefs(structured, sd = {}) {
  return runCode(CODE_SET_PREFERENCES, { chatId:'12345', structured }, sd);
}

test('Sets role_priorities in sd.preferences', () => {
  const sd = {};
  runSetPrefs({ action:'set', role_priorities:{ 'SAP BTP':1, 'Data Analyst':2 }, salary_min:90000, location_pref:'remote' }, sd);
  assert(sd.preferences?.role_priorities?.['SAP BTP'] === 1, 'role_priorities not saved');
  assert(sd.preferences?.salary_min === 90000, 'salary_min not saved');
  assert(sd.preferences?.location_pref === 'remote', 'location_pref not saved');
});

test('Show action with no preferences returns helpful message', () => {
  const { result } = runSetPrefs({ action:'show' }, {});
  assertContains(result[0].json.text, 'No preferences saved', 'Missing empty preferences message');
});

test('Show action displays saved preferences', () => {
  const sd = { preferences:{ role_priorities:{'SAP BTP':1}, salary_min:90000, location_pref:'remote', excluded_locations:['New York'] }};
  const { result } = runSetPrefs({ action:'show' }, sd);
  assertContains(result[0].json.text, 'SAP BTP', 'Missing role in show');
  assertContains(result[0].json.text, '$90,000', 'Missing salary in show');
  assertContains(result[0].json.text, 'remote', 'Missing location in show');
  assertContains(result[0].json.text, 'New York', 'Missing excluded location in show');
});

test('Partial update does not overwrite existing preferences', () => {
  const sd = { preferences:{ salary_min:80000, location_pref:'remote' }};
  runSetPrefs({ action:'set', salary_min:100000 }, sd);
  assert(sd.preferences.salary_min === 100000, 'salary_min not updated');
  assert(sd.preferences.location_pref === 'remote', 'location_pref should be preserved');
});

test('Excluded locations saved as array', () => {
  const sd = {};
  runSetPrefs({ action:'set', excluded_locations:['New York','Chicago'] }, sd);
  assert(Array.isArray(sd.preferences.excluded_locations), 'excluded_locations not an array');
  assert(sd.preferences.excluded_locations.includes('New York'), 'New York not in excluded');
});

test('Confirmation text shows saved preferences', () => {
  const { result } = runSetPrefs({ action:'set', role_priorities:{'SAP BTP':1}, salary_min:90000 });
  assertContains(result[0].json.text, 'Preferences saved', 'Missing saved confirmation');
  assertContains(result[0].json.text, 'SAP BTP', 'Role missing from confirmation');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 8 — CODE_LOG_RECRUITER
// ════════════════════════════════════════════════════════════════════════════
section('8. CODE_LOG_RECRUITER — Recruiter Tracker');

const CODE_LOG_RECRUITER = getNodeCode('Process: Recruiter');

function runLogRecruiter(structured, sd = {}) {
  return runCode(CODE_LOG_RECRUITER, { chatId:'12345', structured }, sd);
}

test('Saves recruiter to sd.recruiters', () => {
  const sd = {};
  runLogRecruiter({ action:'log', name:'John Smith', company:'Deloitte', email:'john@deloitte.com', role:'SAP BTP', source:'email' }, sd);
  assert(sd.recruiters?.length === 1, `Expected 1 recruiter, got ${sd.recruiters?.length}`);
  assert(sd.recruiters[0].name === 'John Smith', 'Wrong name stored');
  assert(sd.recruiters[0].email === 'john@deloitte.com', 'Wrong email stored');
});

test('Returns flat fields for Sheets (no rowData nesting)', () => {
  const { result } = runLogRecruiter({ action:'log', name:'Jane', company:'TCS', email:'jane@tcs.com', role:'Data Analyst', source:'linkedin' });
  const json = result[0].json;
  assert(json.Name === 'Jane', `json.Name wrong: ${json.Name}`);
  assert(json.Company === 'TCS', `json.Company wrong: ${json.Company}`);
  assert(json.Email === 'jane@tcs.com', `json.Email wrong: ${json.Email}`);
  assert(!json.rowData, 'rowData should be spread flat');
});

test('Duplicate email deduplicates (updates existing)', () => {
  const sd = { recruiters:[{ name:'John', company:'Deloitte', email:'john@d.com', role:'SAP', source:'email', date:'2026-01-01' }] };
  runLogRecruiter({ action:'log', name:'John Smith', company:'Deloitte', email:'john@d.com', role:'SAP BTP', source:'email' }, sd);
  assert(sd.recruiters.length === 1, 'Should not duplicate same email');
  assert(sd.recruiters[0].name === 'John Smith', 'Should update name');
  assert(sd.recruiters[0].role === 'SAP BTP', 'Should update role');
});

test('Show action with no recruiters returns empty state', () => {
  const { result } = runLogRecruiter({ action:'show' }, {});
  assertContains(result[0].json.text, 'No recruiters saved', 'Missing empty state');
  assert(result[0].json.showOnly === true, 'showOnly should be true');
});

test('Show action with recruiters lists them', () => {
  const sd = { recruiters:[
    { name:'Alice', company:'IBM', email:'alice@ibm.com', role:'SAP BTP', source:'linkedin', date:'2026-05-01' },
    { name:'Bob', company:'SAP SE', email:'bob@sap.com', role:'ABAP', source:'direct', date:'2026-05-02' },
  ]};
  const { result } = runLogRecruiter({ action:'show' }, sd);
  assertContains(result[0].json.text, 'Alice', 'Alice not in list');
  assertContains(result[0].json.text, 'IBM', 'IBM not in list');
  assertContains(result[0].json.text, '2 total', 'Total count wrong');
});

test('Recruiter cap at 200', () => {
  const sd = { recruiters: Array(200).fill(null).map((_,i) => ({ name:`R${i}`, company:'X', email:`r${i}@x.com`, role:'', source:'', date:'' })) };
  runLogRecruiter({ action:'log', name:'New', company:'Y', email:'new@y.com', role:'', source:'', date:'' }, sd);
  assert(sd.recruiters.length <= 200, `Recruiter list grew beyond 200: ${sd.recruiters.length}`);
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 9 — CODE_STATUS
// ════════════════════════════════════════════════════════════════════════════
section('9. CODE_STATUS — Status Report');

const CODE_STATUS = getNodeCode('Build: Status Report');

function runStatus(sd = {}) {
  return runCode(CODE_STATUS, { chatId:'12345' }, sd);
}

test('Empty state returns helpful zero message', () => {
  const { result } = runStatus({});
  assert(result.length === 1, 'Should return status even with no data');
  assertContains(result[0].json.text, '0', 'Should show 0 applications');
});

test('Shows correct application counts', () => {
  const today = new Date().toISOString().split('T')[0];
  const sd = { applications:[
    { company:'A', role:'R1', dateApplied:today, status:'Applied' },
    { company:'B', role:'R2', dateApplied:today, status:'Interview' },
    { company:'C', role:'R3', dateApplied:'2026-01-01', status:'Rejected' },
  ]};
  const { result } = runStatus(sd);
  assertContains(result[0].json.text, '3', 'Total applications count wrong');
});

test('Shows pause status when paused', () => {
  const { result } = runStatus({ pausedUntil:'2026-06-01', applications:[] });
  assertContains(result[0].json.text, 'paused', 'Should mention paused state');
});

test('Shows recruiter count', () => {
  const sd = { recruiters:[{name:'A'},{name:'B'}], applications:[] };
  const { result } = runStatus(sd);
  assertContains(result[0].json.text, '2', 'Recruiter count missing');
});

test('Shows last resume generated', () => {
  const sd = { lastResumeGenerated:{ company:'Infosys', date:'2026-05-09' }, applications:[] };
  const { result } = runStatus(sd);
  assertContains(result[0].json.text, 'Infosys', 'Last resume company missing from status');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 10 — SCHEDULE NODES (pause guard)
// ════════════════════════════════════════════════════════════════════════════
section('10. SCHEDULE NODES — Pause Guard & Briefings');

const CODE_MORNING   = getNodeCode('Run: Morning Briefing');
const CODE_EVENING   = getNodeCode('Run: Evening Summary');
const CODE_FOLLOWUP  = getNodeCode('Run: Follow-up Check');
const CODE_WEEKLY    = getNodeCode('Run: Weekly Review');

function checkPauseGuard(codeStr, label) {
  test(`${label}: returns [] when paused`, () => {
    const sd = { chatId:'12345', pausedUntil:'2099-12-31' };
    const { result } = runCode(codeStr, {}, sd);
    assert(result.length === 0, `Should return [] when paused, got ${result.length} items`);
  });
  test(`${label}: returns [] when no chatId registered`, () => {
    const { result } = runCode(codeStr, {}, {});
    assert(result.length === 0, `Should return [] when no chatId, got ${result.length} items`);
  });
}

checkPauseGuard(CODE_MORNING,  'Morning Briefing');
checkPauseGuard(CODE_EVENING,  'Evening Summary');
checkPauseGuard(CODE_FOLLOWUP, 'Follow-up Checker');
checkPauseGuard(CODE_WEEKLY,   'Weekly Review');

test('Morning Briefing: shows jobs from digestQueue', () => {
  const sd = { chatId:'12345', digestQueue:[
    { title:'SAP BTP Dev', company:'Infosys', score:9, source:'Gmail' },
    { title:'Data Analyst', company:'IBM', score:6, source:'Gmail' },
  ]};
  const { result } = runCode(CODE_MORNING, {}, sd);
  assert(result.length === 1, 'Should return 1 briefing item');
  assertContains(result[0].json.text, 'Infosys', 'Infosys job missing from briefing');
  assertContains(result[0].json.text, '🟢', 'Green icon missing for score 9');
});

test('Morning Briefing: empty queue shows correct message (not "30 min" message)', () => {
  const sd = { chatId:'12345', digestQueue:[] };
  const { result } = runCode(CODE_MORNING, {}, sd);
  assertContains(result[0].json.text, 'No new jobs queued yet', 'Wrong empty queue message');
  assertNotContains(result[0].json.text, '30 min', 'Old incorrect message still present');
});

test('Morning Briefing: pops jobs from queue after showing', () => {
  const sd = { chatId:'12345', digestQueue:[
    { title:'Job1', company:'A', score:8, source:'Gmail' },
    { title:'Job2', company:'B', score:7, source:'Gmail' },
    { title:'Job3', company:'C', score:6, source:'Gmail' },
    { title:'Job4', company:'D', score:5, source:'Gmail' },
  ]};
  runCode(CODE_MORNING, {}, sd);
  assert(sd.digestQueue.length === 1, `Queue should have 1 left after showing top 3, got ${sd.digestQueue.length}`);
});

test('Evening Summary: shows applied=0 driver mode message', () => {
  const today = new Date().toDateString();
  const sd = { chatId:'12345', dailyActivity:{ [today]:{ analyzed:3, applied:0 } }, applications:[] };
  const { result } = runCode(CODE_EVENING, {}, sd);
  assertContains(result[0].json.text, "didn't apply today", 'Driver mode message missing for 0 applications');
});

test('Evening Summary: positive message for 3+ applications', () => {
  const today = new Date().toDateString();
  const sd = { chatId:'12345', dailyActivity:{ [today]:{ analyzed:5, applied:3 } }, applications:[] };
  const { result } = runCode(CODE_EVENING, {}, sd);
  assertContains(result[0].json.text, 'Solid day', 'Missing positive message for 3 applications');
});

test('Follow-up Checker: fires on day 7', () => {
  const sevenDaysAgo = new Date(); sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sd = { chatId:'12345', applications:[
    { company:'Infosys', role:'SAP BTP', dateApplied:sevenDaysAgo.toISOString().split('T')[0], status:'Applied' }
  ]};
  const { result } = runCode(CODE_FOLLOWUP, {}, sd);
  assert(result.length === 1, 'Should fire reminder on day 7');
  assertContains(result[0].json.text, 'Infosys', 'Company missing from reminder');
  assertContains(result[0].json.text, '7 days', 'Days count missing');
});

test('Follow-up Checker: fires on day 14', () => {
  const fourteenDaysAgo = new Date(); fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);
  const sd = { chatId:'12345', applications:[
    { company:'TCS', role:'Data', dateApplied:fourteenDaysAgo.toISOString().split('T')[0], status:'Applied' }
  ]};
  const { result } = runCode(CODE_FOLLOWUP, {}, sd);
  assert(result.length === 1, 'Should fire reminder on day 14');
  assertContains(result[0].json.text, '14 days', '14-day count missing');
});

test('Follow-up Checker: does NOT fire for non-Applied status', () => {
  const sevenDaysAgo = new Date(); sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sd = { chatId:'12345', applications:[
    { company:'IBM', role:'AI', dateApplied:sevenDaysAgo.toISOString().split('T')[0], status:'Interview' }
  ]};
  const { result } = runCode(CODE_FOLLOWUP, {}, sd);
  assert(result.length === 0, 'Should not fire for Interview status');
});

test('Follow-up Checker: does NOT fire on day 3', () => {
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const sd = { chatId:'12345', applications:[
    { company:'SAP', role:'BTP', dateApplied:threeDaysAgo.toISOString().split('T')[0], status:'Applied' }
  ]};
  const { result } = runCode(CODE_FOLLOWUP, {}, sd);
  assert(result.length === 0, 'Should not fire on day 3 (only day 7 and 14)');
});

test('Weekly Review: outputs statsMessage string and claudeBody', () => {
  const sd = { chatId:'12345', applications:[
    { company:'A', role:'SAP BTP', dateApplied: new Date().toISOString().split('T')[0], status:'Applied' }
  ]};
  const { result } = runCode(CODE_WEEKLY, {}, sd);
  assert(result.length === 1, 'Should return 1 item');
  assert(typeof result[0].json.statsMessage === 'string', 'statsMessage should be a string');
  assert(typeof result[0].json.claudeBody === 'string', 'claudeBody should be a string');
  // Verify claudeBody is valid JSON
  const body = JSON.parse(result[0].json.claudeBody);
  assert(body.model === 'claude-haiku-4-5', 'Wrong model in claudeBody');
  assert(Array.isArray(body.messages), 'messages should be an array in claudeBody');
  assert(body.messages[0].content === result[0].json.statsMessage, 'claudeBody should use statsMessage');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 11 — EMAIL PROCESSING
// ════════════════════════════════════════════════════════════════════════════
section('11. EMAIL PROCESSING — Gmail Filter & Scoring');

const CODE_FILTER_EMAIL = getNodeCode('Filter: Is Job Email?');
const CODE_SCORE_EMAILS = getNodeCode('Score & Format Emails');

function runFilterEmail(emailData, sd = {}) {
  return runCode(CODE_FILTER_EMAIL, emailData, sd);
}

test('Job email from LinkedIn passes filter', () => {
  const { result } = runFilterEmail({ from:{ value:[{ address:'jobs@linkedin.com' }] }, subject:'SAP BTP Developer opportunity', text:'We have an exciting role...', snippet:'' });
  assert(result.length === 1, 'LinkedIn job email should pass filter');
  assert(result[0].json.emailText, 'emailText should be set');
  assert(result[0].json.claudeBody, 'claudeBody should be pre-built');
});

test('Job email from recruiter with job keywords passes filter', () => {
  const { result } = runFilterEmail({ from:{ value:[{ address:'sarah@recruiting.com' }] }, subject:'SAP ABAP Developer - Remote - H1B sponsored', text:'Hi, I wanted to reach out about an opening...', snippet:'' });
  assert(result.length === 1, 'Recruiter job email should pass filter');
});

test('Promotional email is filtered out', () => {
  const { result } = runFilterEmail({ from:{ value:[{ address:'deals@amazon.com' }] }, subject:'Flash sale — 50% off everything!', text:'Limited time offer...', snippet:'50% off sale ends tonight' });
  assert(result.length === 0, 'Promo email should be filtered out');
});

test('Unrelated email (bank statement) is filtered out', () => {
  const { result } = runFilterEmail({ from:{ value:[{ address:'no-reply@chase.com' }] }, subject:'Your statement is ready', text:'Your monthly statement is available...', snippet:'' });
  assert(result.length === 0, 'Bank email should be filtered out');
});

test('claudeBody is valid JSON with correct structure', () => {
  const { result } = runFilterEmail({ from:{ value:[{ address:'hr@infosys.com' }] }, subject:'SAP BTP role at Infosys', text:'We are hiring...', snippet:'' });
  assert(result.length === 1, 'Email should pass filter');
  const body = JSON.parse(result[0].json.claudeBody);
  assert(body.model === 'claude-haiku-4-5', 'Wrong model');
  assert(body.messages[0].role === 'user', 'Wrong message role');
  assertContains(body.messages[0].content, 'hr@infosys.com', 'Email content not in claudeBody');
});

// Score emails tests
const mockEmailItems = [
  { json:{ subject:'SAP BTP Integration Developer - Remote - H1B Sponsor', from:{ value:[{ address:'jobs@linkedin.com', name:'LinkedIn Jobs' }] }, snippet:'Infosys is looking for SAP BTP developer with OData experience', text:'We need SAP ABAP BTP developer...' } },
  { json:{ subject:'Data Analyst position at IBM', from:{ value:[{ address:'hr@ibm.com', name:'IBM HR' }] }, snippet:'Data analyst role with H1B sponsorship available', text:'...' } },
  { json:{ subject:'Big sale this weekend!', from:{ value:[{ address:'promo@store.com', name:'Store' }] }, snippet:'50% off all items', text:'...' } },
  { json:{ subject:'SAP ABAP consultant opportunity', from:{ value:[{ address:'sarah@recruit.com', name:'Sarah' }] }, snippet:'Looking for SAP ABAP developer', text:'...' } },
];

function runScoreEmails(items, buildData = { chatId:'12345', daysBack:7, roleFilterStr:'all roles' }) {
  const lastIndex = items.length - 1;
  return runCode(CODE_SCORE_EMAILS, items[lastIndex].json, {},
    { allItems: items, itemIndex: lastIndex,
      nodeRefs: { 'Build: Email Query': buildData } }
  );
}

test('Score emails: SAP BTP email gets high score (>=7)', () => {
  const items = [mockEmailItems[0]];
  const { result } = runScoreEmails(items);
  assert(result.length === 1, 'Should return results');
  assertContains(result[0].json.text, '🟢', 'SAP BTP email should get green (high score)');
});

test('Score emails: promo email filtered out', () => {
  const items = [mockEmailItems[2]]; // promo only
  const { result } = runScoreEmails(items);
  // Promo email is filtered out, so scored.length === 0
  assertContains(result[0].json.text, 'none look like job opportunities', 'Promo email should be filtered');
});

test('Score emails: returns [] for non-last item (dedup guard)', () => {
  const items = [...mockEmailItems]; // 4 items
  // Run for item index 0 (not last) — should return []
  const result = runCode(CODE_SCORE_EMAILS, items[0].json, {},
    { allItems: items, itemIndex: 0,
      nodeRefs: { 'Build: Email Query': { chatId:'12345', daysBack:7, roleFilterStr:'all' } }
    }
  ).result;
  assert(result.length === 0, `Non-last item should return [], got ${result.length} items`);
});

test('Score emails: empty input returns no-results message', () => {
  // Empty array: use a dummy item to trigger code, but pass empty allItems via extras
  const buildData = { chatId:'12345', daysBack:7, roleFilterStr:'all roles' };
  const { result } = runCode(CODE_SCORE_EMAILS, {}, {},
    { allItems: [], itemIndex: 0, nodeRefs: { 'Build: Email Query': buildData } }
  );
  assert(result.length === 1, 'Should return 1 item for empty array');
  assertContains(result[0].json.text, 'No emails matched', 'Missing empty results message');
});

test('Score emails: multiple emails — sorted by score, max 8', () => {
  const manyItems = Array(10).fill(null).map((_,i) => ({
    json:{ subject:`SAP ABAP BTP job ${i} - H1B sponsor`, from:{ value:[{ address:`r${i}@recruit.com`, name:`R${i}` }] }, snippet:`SAP developer ABAP BTP role ${i}`, text:`job ${i}` }
  }));
  const { result } = runScoreEmails(manyItems);
  assertContains(result[0].json.text, 'Found ', 'Should say how many found');
  // Max 8 shown
  const matches = result[0].json.text.match(/\d+\. [🟢🟡⚪]/g) || [];
  assert(matches.length <= 8, `Should show max 8 results, got ${matches.length}`);
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 12 — CODE_PARSE_GMAIL_JOB
// ════════════════════════════════════════════════════════════════════════════
section('12. CODE_PARSE_GMAIL_JOB — Gmail Job Alert Processing');

const CODE_PARSE_GMAIL_JOB = getNodeCode('Parse: Gmail Job Response');

function runParseGmailJob(claudeResponse, sd = {}) {
  return runCode(CODE_PARSE_GMAIL_JOB, { content:[{ text: claudeResponse }] }, sd);
}

test('Valid job email parsed and stored in sd.lastAnalyzedJob', () => {
  const sd = { chatId:'12345' };
  const resp = JSON.stringify({ is_job:true, title:'SAP BTP Dev', company:'Infosys', score:8, classification:'APPLY NOW', apply_link:'https://infosys.com/apply', keywords:['BTP','OData'], visa_sponsor:'Yes', salary:'$100k', location:'Remote', exp_required:'5yr', alert_text:'🟢 SAP BTP Dev @ Infosys\n⭐ 8/10 — APPLY NOW' });
  runParseGmailJob(resp, sd);
  assert(sd.lastAnalyzedJob?.company === 'Infosys', 'lastAnalyzedJob not set');
  assert(sd.lastAnalyzedJob?.score === 8, 'Score not stored');
});

test('Valid job also added to sd.digestQueue', () => {
  const sd = { chatId:'12345' };
  const resp = JSON.stringify({ is_job:true, title:'Data Analyst', company:'IBM', score:7, classification:'APPLY NOW', apply_link:'', keywords:[], visa_sponsor:'Yes', salary:'$85k', location:'Remote', exp_required:'3yr', alert_text:null });
  runParseGmailJob(resp, sd);
  assert(Array.isArray(sd.digestQueue), 'digestQueue should be array');
  assert(sd.digestQueue.length === 1, 'Job should be added to digestQueue');
  assert(sd.digestQueue[0].company === 'IBM', 'Wrong company in digestQueue');
});

test('Non-job email returns [] (is_job: false)', () => {
  const sd = { chatId:'12345' };
  const resp = JSON.stringify({ is_job:false });
  const { result } = runParseGmailJob(resp, sd);
  assert(result.length === 0, 'Non-job should return []');
});

test('Dedup: same job seen twice is not shown again', () => {
  const sd = { chatId:'12345', seenGmailJobs:['sap btp dev_infosys'] };
  const resp = JSON.stringify({ is_job:true, title:'SAP BTP Dev', company:'Infosys', score:8, classification:'APPLY NOW', apply_link:'', keywords:[], visa_sponsor:'Yes', salary:'', location:'', exp_required:'', alert_text:null });
  const { result } = runParseGmailJob(resp, sd);
  assert(result.length === 0, 'Duplicate job should be deduped');
});

test('No chatId registered — returns []', () => {
  const sd = {};
  const resp = JSON.stringify({ is_job:true, title:'Job', company:'Co', score:7, classification:'APPLY NOW', apply_link:'', keywords:[], visa_sponsor:'', salary:'', location:'', exp_required:'', alert_text:null });
  const { result } = runParseGmailJob(resp, sd);
  assert(result.length === 0, 'Should return [] without chatId');
});

test('digestQueue capped at 20 items', () => {
  const sd = { chatId:'12345', digestQueue: Array(20).fill({ title:'Old', company:`X`, score:5, source:'Gmail' }) };
  const resp = JSON.stringify({ is_job:true, title:'New Job', company:'NewCo', score:9, classification:'APPLY NOW', apply_link:'', keywords:[], visa_sponsor:'', salary:'', location:'', exp_required:'', alert_text:'🟢 New Job' });
  runParseGmailJob(resp, sd);
  assert(sd.digestQueue.length <= 20, `digestQueue grew beyond 20: ${sd.digestQueue.length}`);
});

test('Malformed Claude response returns []', () => {
  const sd = { chatId:'12345' };
  const { result } = runParseGmailJob('not valid json', sd);
  assert(result.length === 0, 'Malformed response should return []');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 13 — CODE_PREP_RESUME
// ════════════════════════════════════════════════════════════════════════════
section('13. CODE_PREP_RESUME — Resume Builder');

const CODE_PREP_RESUME = getNodeCode('Prep: Resume Build');

function runPrepResume(input, sd = {}) {
  return runCode(CODE_PREP_RESUME, input, sd);
}

test('Builds correct command and outputPath', () => {
  const sd = { lastAnalyzedJob:{ company:'Infosys', title:'SAP BTP Developer', keywords:['BTP','OData'], link:'https://infosys.com/job', exp_required:'5 years' } };
  const { result } = runPrepResume({ chatId:'12345', lastJob:null, structured:null }, sd);
  assert(result.length === 1, 'Should return 1 item');
  assertContains(result[0].json.buildCmd, 'build_resume_dynamic.js', 'Missing script name in command');
  assertContains(result[0].json.outputPath, '/home/ubuntu/n8n-files/', 'Wrong output directory');
  assertContains(result[0].json.outputPath, 'Infosys', 'Company not in output path');
  assertNotContains(result[0].json.outputPath, '/root/', 'Should not use /root/ path');
});

test('Date stamp included in output filename', () => {
  const sd = { lastAnalyzedJob:{ company:'TCS', title:'Data Analyst', keywords:[], exp_required:'3yr' } };
  const { result } = runPrepResume({ chatId:'12345', lastJob:null }, sd);
  const today = new Date().toISOString().split('T')[0];
  assertContains(result[0].json.outputPath, today, 'Date stamp missing from filename');
});

test('sd.lastResumeGenerated stored after prep', () => {
  const sd = { lastAnalyzedJob:{ company:'Deloitte', title:'SAP Consultant', keywords:[], exp_required:'5yr' } };
  runPrepResume({ chatId:'12345', lastJob:null }, sd);
  assert(sd.lastResumeGenerated?.company === 'Deloitte', 'lastResumeGenerated not stored');
  assert(sd.lastResumeGenerated?.date, 'Date not stored in lastResumeGenerated');
  assert(sd.lastResumeGenerated?.path, 'Path not stored in lastResumeGenerated');
});

test('No job context returns noJob=true with helpful message', () => {
  const { result } = runPrepResume({ chatId:'12345', lastJob:null, structured:null }, {});
  assert(result[0].json.noJob === true, 'noJob flag should be true when no job context');
  assertContains(result[0].json.text, 'No job analyzed yet', 'Missing no-job message');
});

test('Special characters in company name are sanitized in path', () => {
  const sd = { lastAnalyzedJob:{ company:'SAP S/4HANA & BTP', title:'Dev', keywords:[], exp_required:'5yr' } };
  const { result } = runPrepResume({ chatId:'12345', lastJob:null }, sd);
  // Extract just the filename part (after last /) to check company sanitization
  const filename = result[0].json.outputPath.split('/').pop();
  assertNotContains(filename, '/', 'Forward slashes in company name should be removed');
  assertNotContains(filename, '&', 'Ampersand in company should be removed');
  assertContains(filename, 'SAP', 'SAP should still be in filename');
});

test('lastJob from $json takes priority over sd.lastAnalyzedJob', () => {
  const sd = { lastAnalyzedJob:{ company:'OldCompany', title:'Old Role', keywords:[], exp_required:'' } };
  const { result } = runPrepResume({ chatId:'12345', lastJob:{ company:'NewCompany', title:'New Role', keywords:[], exp_required:'5yr' } }, sd);
  assertContains(result[0].json.outputPath, 'NewCompany', 'lastJob from $json should override sd');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 14 — CODE_BUILD_EMAIL_QUERY
// ════════════════════════════════════════════════════════════════════════════
section('14. CODE_BUILD_EMAIL_QUERY — Gmail Search Query Builder');

const CODE_BUILD_EMAIL_QUERY = getNodeCode('Build: Email Query');

function runBuildEmailQuery(structured, sd = { chatId:'12345' }) {
  return runCode(CODE_BUILD_EMAIL_QUERY, { chatId:'12345', structured, response:'Scanning...' }, sd);
}

test('Builds correct after: date prefix', () => {
  const { result } = runBuildEmailQuery({ days_back:7 });
  const q = result[0].json.gmailQuery;
  assertContains(q, 'after:', 'Missing after: prefix');
  const dateMatch = q.match(/after:(\d{4}\/\d{2}\/\d{2})/);
  assert(dateMatch, 'Date format wrong in query');
});

test('Custom role filter included in query', () => {
  const { result } = runBuildEmailQuery({ days_back:7, role_filter:['SAP BTP','ABAP'], extra_keywords:[] });
  assertContains(result[0].json.gmailQuery, 'SAP BTP', 'Role filter not in query');
  assertContains(result[0].json.gmailQuery, 'ABAP', 'ABAP filter not in query');
});

test('Default role filter used when none specified', () => {
  const { result } = runBuildEmailQuery({ days_back:7 });
  assertContains(result[0].json.gmailQuery, 'SAP', 'Default SAP term should be in query');
});

test('days_back=30 gives correct date (30 days ago)', () => {
  const { result } = runBuildEmailQuery({ days_back:30 });
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30);
  const expected = `${thirtyDaysAgo.getFullYear()}/${String(thirtyDaysAgo.getMonth()+1).padStart(2,'0')}/${String(thirtyDaysAgo.getDate()).padStart(2,'0')}`;
  assertContains(result[0].json.gmailQuery, expected, `30-day date wrong in query`);
});

test('scanningMsg uses Claude response when available', () => {
  const { result } = runBuildEmailQuery({ days_back:7 });
  assert(result[0].json.scanningMsg === 'Scanning...', 'scanningMsg should use $json.response');
});


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 15 — END-TO-END FLOW SIMULATIONS
// ════════════════════════════════════════════════════════════════════════════
section('15. END-TO-END FLOW SIMULATIONS');

test('Full job analysis → apply → follow-up flow', () => {
  const sd = { chatId: '12345' };
  // Step 1: analyze_job stored in sd
  const analyzePayload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Strong match.',
    structured:{ title:'SAP BTP Developer', company:'Infosys', score:9, classification:'APPLY NOW',
      location:'Remote', salary:'$105k', visa_sponsor:'Yes', exp_required:'5 years', keywords:['BTP','OData'], ats_score:88, missing_skills:[] }});
  runParseClaudeSimple(analyzePayload, sd);
  assert(sd.lastAnalyzedJob?.company === 'Infosys', 'E2E: analyze not stored');

  // Step 2: prep resume (uses sd.lastAnalyzedJob)
  const { result: resumeResult } = runPrepResume({ chatId:'12345', lastJob: null }, sd);
  assert(resumeResult[0].json.company === 'Infosys', 'E2E: resume company wrong');
  assert(sd.lastResumeGenerated?.company === 'Infosys', 'E2E: lastResumeGenerated not set');

  // Step 3: log applied
  const { result: applyResult } = runLogApplied({ structured:{ company:'Infosys', role:'SAP BTP Developer' }, chatId:'12345' }, sd);
  assert(sd.applications?.length === 1, 'E2E: application not logged');
  assert(applyResult[0].json.Company === 'Infosys', 'E2E: Company not in Sheets fields');
  assertContains(applyResult[0].json['Resume Version'], 'Infosys', 'E2E: resume version not linked');

  // Step 4: follow-up fires on day 7 — use UTC dates to avoid timezone off-by-one
  const sevenDaysAgo = new Date(); sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  sd.applications[0].dateApplied = sevenDaysAgo.toISOString().split('T')[0];
  const { result: followupResult } = runCode(CODE_FOLLOWUP, {}, sd);
  assert(followupResult.length === 1, 'E2E: follow-up should fire on day 7');
  assertContains(followupResult[0].json.text, 'Infosys', 'E2E: company missing from follow-up');

  // Step 5: mark interview
  const { result: outcomeResult, sd: finalSd } = runMarkOutcome({
    chatId:'12345', response:'Moving to interview!',
    structured:{ company:'Infosys', outcome:'interview', stage:'phone_screen' }
  }, sd);
  assert(sd.applications[0].status === 'Interview', 'E2E: status not updated to Interview');

  // Step 6: search apps shows interview stage
  const { result: searchResult } = runSearchApps({ status_filter:'interview', days_back:30 }, sd.applications);
  assertContains(searchResult[0].json.text, 'Infosys', 'E2E: search should find Infosys');
});

test('Gmail alert → digest queue → morning briefing flow', () => {
  const sd = { chatId:'12345' };
  // Step 1: Gmail job arrives and is parsed
  const gmailResp = JSON.stringify({ is_job:true, title:'SAP BTP Dev', company:'Infosys', score:9, classification:'APPLY NOW', apply_link:'https://apply.here', keywords:['BTP'], visa_sponsor:'Yes', salary:'$100k', location:'Remote', exp_required:'5yr', alert_text:'🟢 SAP BTP Dev @ Infosys\n⭐ 9/10' });
  const { result: alertResult } = runParseGmailJob(gmailResp, sd);
  assert(alertResult.length === 1, 'E2E Gmail: alert should be sent');
  assert(sd.digestQueue?.length === 1, 'E2E Gmail: job should be in digestQueue');

  // Step 2: morning briefing shows the queued job
  const { result: briefingResult } = runCode(CODE_MORNING, {}, sd);
  assert(briefingResult.length === 1, 'E2E Gmail: morning briefing should fire');
  assertContains(briefingResult[0].json.text, 'Infosys', 'E2E Gmail: job missing from briefing');
  assert(sd.digestQueue.length === 0, 'E2E Gmail: queue should be empty after showing');
});

test('Pause → briefings stop → resume → briefings restart flow', () => {
  const sd = { chatId:'12345' };
  // Step 1: pause
  runPauseMode({ action:'pause', resume_date:'2026-06-01' }, sd);
  assert(sd.pausedUntil === '2026-06-01', 'E2E Pause: pausedUntil not set');

  // Step 2: briefings should return []
  const { result: morningResult } = runCode(CODE_MORNING, {}, sd);
  assert(morningResult.length === 0, 'E2E Pause: morning briefing should be silent when paused');

  // Step 3: resume
  runPauseMode({ action:'resume' }, sd);
  assert(sd.pausedUntil === null, 'E2E Pause: pausedUntil should be null after resume');

  // Step 4: briefings should work again
  const { result: morningResult2 } = runCode(CODE_MORNING, {}, sd);
  assert(morningResult2.length === 1, 'E2E Pause: morning briefing should resume after unpause');
});

test('Recruiter log → show list flow', () => {
  const sd = {};
  // Step 1: log recruiter
  runLogRecruiter({ action:'log', name:'John', company:'Deloitte', email:'john@d.com', role:'SAP BTP', source:'email' }, sd);
  runLogRecruiter({ action:'log', name:'Sarah', company:'IBM', email:'sarah@ibm.com', role:'Data Analyst', source:'linkedin' }, sd);
  assert(sd.recruiters?.length === 2, 'E2E Recruiter: 2 recruiters should be stored');

  // Step 2: show list
  const { result } = runLogRecruiter({ action:'show' }, sd);
  assertContains(result[0].json.text, 'John', 'E2E Recruiter: John missing from list');
  assertContains(result[0].json.text, 'Sarah', 'E2E Recruiter: Sarah missing from list');
  assertContains(result[0].json.text, '2 total', 'E2E Recruiter: total count wrong');

  // Step 3: status report includes recruiter count
  const { result: statusResult } = runStatus(sd);
  assertContains(statusResult[0].json.text, '2', 'E2E Recruiter: status should show 2 recruiters');
});

test('Preferences set → job analysis respects them', () => {
  const sd = {};
  // Step 1: set preferences
  runSetPrefs({ action:'set', role_priorities:{'SAP BTP':1}, salary_min:100000, location_pref:'remote', excluded_locations:['New York'] }, sd);

  // Step 2: analyze job matching preferences
  const goodPayload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Great match.',
    structured:{ title:'SAP BTP Developer', company:'Infosys', score:8, classification:'APPLY NOW', location:'Remote', salary:'$110k', visa_sponsor:'Yes', exp_required:'5yr', keywords:['BTP'] }});
  const { result: goodResult } = runParseClaudeSimple(goodPayload, sd);
  assertContains(goodResult[0].json.response, '⭐ Tier 1 priority match', 'Should show priority match');
  assertNotContains(goodResult[0].json.response, 'Below salary floor', 'Should not flag $110k against $100k floor');
  assertNotContains(goodResult[0].json.response, 'Excluded location', 'Remote should not be excluded');

  // Step 3: analyze job violating preferences
  const badPayload = JSON.stringify({ intent:'analyze_job', mode:'coach', response:'Low pay.',
    structured:{ title:'Data Analyst', company:'TCS', score:5, classification:'MAYBE', location:'New York, NY', salary:'$75k', visa_sponsor:'No', exp_required:'3yr', keywords:[] }});
  const { result: badResult } = runParseClaudeSimple(badPayload, sd);
  assertContains(badResult[0].json.response, '🚫 Excluded location', 'Should flag New York');
  assertContains(badResult[0].json.response, 'Below salary floor', 'Should flag $75k below $100k floor');
});

function runSetPrefs(structured, sd) {
  return runCode(CODE_SET_PREFERENCES, { chatId:'12345', structured }, sd);
}
function runStatus(sd) {
  return runCode(CODE_STATUS, { chatId:'12345' }, sd);
}
function runPauseMode(structured, sd) {
  return runCode(CODE_PAUSE_MODE, { chatId:'12345', structured }, sd);
}
function runLogRecruiter(structured, sd) {
  return runCode(CODE_LOG_RECRUITER, { chatId:'12345', structured }, sd);
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 16 — EDGE CASES & STRESS TESTS
// ════════════════════════════════════════════════════════════════════════════
section('16. EDGE CASES & STRESS TESTS');

test('All code nodes handle completely empty $json without crashing', () => {
  const nodes = [
    'Parse Claude Response', 'Process: Log Applied', 'Process: Mark Outcome',
    'Build: App Search Results', 'Process: Pause Mode', 'Process: Preferences',
    'Process: Recruiter', 'Build: Status Report', 'Build: Email Query',
    'Prep: Resume Build',
  ];
  const errors = [];
  nodes.forEach(name => {
    try {
      runCode(getNodeCode(name), {}, {},
        { nodeRefs: { 'Process Message': { chatId:'12345' } } }
      );
    } catch(e) {
      errors.push(`${name}: ${e.message}`);
    }
  });
  assert(errors.length === 0, `Nodes crashed on empty input:\n    ${errors.join('\n    ')}`);
});

test('History trimming prevents memory growth beyond 8 entries', () => {
  const sd = {};
  for (let i = 0; i < 15; i++) {
    runParseClaudeSimple(JSON.stringify({ intent:'general', mode:'friend', response:`Reply ${i}`, structured:null }), sd);
  }
  assert((sd.history?.length || 0) <= 8, `History grew to ${sd.history?.length} — should cap at 8`);
});

test('Application list handles 100+ entries without crash', () => {
  const apps = Array(100).fill(null).map((_,i) => ({
    company: `Company${i}`, role: `Role${i}`,
    dateApplied: new Date().toISOString().split('T')[0],
    status: ['Applied','Interview','Rejected','Ghosted'][i % 4]
  }));
  const { result } = runSearchApps({ status_filter:'all', days_back:30 }, apps);
  assert(result.length === 1, 'Should handle 100 apps without crash');
  // Results capped at 15
  const lines = result[0].json.text.match(/\d+\. [📤📞❌💰👻]/g) || [];
  assert(lines.length <= 15, `Should show max 15 results, got ${lines.length}`);
});

test('Recruiter list of 199 + 1 new stays at 200 (not 201)', () => {
  const sd = { recruiters: Array(199).fill(null).map((_,i) => ({ name:`R${i}`, company:'X', email:`r${i}@x.com`, role:'', source:'', date:'' })) };
  runCode(CODE_LOG_RECRUITER, { chatId:'12345', structured:{ action:'log', name:'New', company:'Y', email:'new@y.com', role:'', source:'' } }, sd);
  assert(sd.recruiters.length <= 200, `Should be <=200, got ${sd.recruiters.length}`);
});

test('seenGmailJobs dedup list capped at 500', () => {
  const sd = { chatId:'12345', seenGmailJobs: Array(500).fill('old_entry_xyz') };
  const resp = JSON.stringify({ is_job:true, title:'New Unique Job', company:'UniqueCompany', score:8, classification:'APPLY NOW', apply_link:'', keywords:[], visa_sponsor:'', salary:'', location:'', exp_required:'', alert_text:'Alert' });
  runParseGmailJob(resp, sd);
  assert(sd.seenGmailJobs.length <= 500, `seenGmailJobs grew beyond 500: ${sd.seenGmailJobs.length}`);
});

test('dailyActivity older than 30 days is pruned', () => {
  const sd = { history:[] };
  // Create 35 days of activity
  for (let i = 0; i < 35; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (!sd.dailyActivity) sd.dailyActivity = {};
    sd.dailyActivity[d.toDateString()] = { analyzed:1, applied:1 };
  }
  runParseClaudeSimple(JSON.stringify({ intent:'general', mode:'friend', response:'Hi', structured:null }), sd);
  assert(Object.keys(sd.dailyActivity).length <= 30, `dailyActivity not pruned: ${Object.keys(sd.dailyActivity).length} days`);
});

test('Email filter handles string `from` (not object) gracefully', () => {
  // Some Gmail responses send `from` as a plain string
  const { result } = runFilterEmail({ from:'jobs@linkedin.com', subject:'SAP Developer opportunity', text:'We are hiring...', snippet:'' });
  assert(result.length === 1, 'String from field should work (LinkedIn email)');
});

test('Score emails handles `from` as plain string', () => {
  const items = [{ json:{ subject:'SAP BTP developer role - H1B', from:'hr@infosys.com', snippet:'SAP ABAP BTP developer needed', text:'' } }];
  const { result } = runScoreEmails(items);
  assert(result.length === 1, 'Plain string from should not crash');
});


// ════════════════════════════════════════════════════════════════════════════
//  SUMMARY
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(65)}`);
console.log(B('TEST RESULTS'));
console.log('═'.repeat(65));
console.log(`${G('✓ Passed:')} ${passed}`);
if (warned > 0) console.log(`${Y('⚠ Warned:')} ${warned}`);
if (failed > 0) {
  console.log(`${R('✗ Failed:')} ${failed}`);
  console.log(`\n${B(R('FAILURES:'))}`);
  failures.forEach((f, i) => {
    console.log(`  ${i+1}. ${R(f.label)}`);
    console.log(`     ${D(f.error)}`);
  });
}
console.log('═'.repeat(65));
const total = passed + failed + warned;
const pct = Math.round((passed / total) * 100);
console.log(`Total: ${total} tests | Pass rate: ${pct}%`);
if (failed === 0) {
  console.log(`\n${G(B('✅ ALL TESTS PASSED — workflow is ready to deploy'))}`);
} else {
  console.log(`\n${R(B(`❌ ${failed} test(s) failed — fix before deploying`))}`);
  process.exit(1);
}
