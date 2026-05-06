/**
 * build_resume_dynamic.js
 * Generates a tailored DOCX resume for a specific job.
 *
 * Usage: node build_resume_dynamic.js '<json>'
 *
 * JSON shape:
 * {
 *   "summary": "tailored summary text",
 *   "company": "Infosys",
 *   "role": "SAP BTP Integration Developer",
 *   "keywords": ["BTP", "CPI", "Integration Suite"],
 *   "outputPath": "/tmp/HarshaYelamati_Infosys.docx"
 * }
 *
 * Outputs: DOCX file at outputPath (prints path to stdout on success)
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, BorderStyle, WidthType,
  TabStopType, TabStopPosition, ExternalHyperlink, UnderlineType,
} = require('docx');
const fs   = require('fs');
const path = require('path');
const base = require('./resume_base_data');

// ── Parse args ──────────────────────────────────────────────────────────────
let jobCtx = {};
try {
  const raw = process.argv[2] || '{}';
  jobCtx = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`[build_resume_dynamic] Failed to parse job context: ${e.message}\n`);
  process.exit(1);
}

const summary    = jobCtx.summary    || base.defaultSummary;
const company    = jobCtx.company    || 'Company';
const role       = jobCtx.role       || 'SAP Consultant';
const outputPath = jobCtx.outputPath ||
  `/tmp/HarshaYelamati_${company.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

// Ensure output directory exists
const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ── Layout constants ─────────────────────────────────────────────────────────
const CONTENT_WIDTH = 9360;
const noBorder  = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Helpers ──────────────────────────────────────────────────────────────────
function sectionDivider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "2E4057", space: 1 } },
    spacing: { before: 160, after: 80 },
    children: [],
  });
}

function sectionHeader(text) {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: "2E4057", font: "Calibri" })],
  });
}

function dividerAndHeader(text) {
  return [sectionDivider(), sectionHeader(text)];
}

function bullet(text, boldPrefix) {
  const runs = [];
  if (boldPrefix) {
    runs.push(new TextRun({ text: boldPrefix, bold: true, size: 20, font: "Calibri" }));
    runs.push(new TextRun({ text,              size: 20, font: "Calibri" }));
  } else {
    runs.push(new TextRun({ text, size: 20, font: "Calibri" }));
  }
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing:   { before: 20, after: 20 },
    children:  runs,
  });
}

function jobHeader(title, company, dates) {
  return new Paragraph({
    spacing: { before: 140, after: 30 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: title,              bold: true, size: 21, font: "Calibri" }),
      new TextRun({ text: "  |  ",            size: 21, font: "Calibri", color: "888888" }),
      new TextRun({ text: company,            size: 21, font: "Calibri", italics: true }),
      new TextRun({ text: "\t" + dates,       size: 20, font: "Calibri", color: "555555" }),
    ],
  });
}

function projectHeader(title, subtitle) {
  return new Paragraph({
    spacing: { before: 140, after: 30 },
    children: [
      new TextRun({ text: title,                                  bold: true, size: 21, font: "Calibri" }),
      new TextRun({ text: subtitle ? "  —  " + subtitle : "",    size: 20,   font: "Calibri", color: "666666", italics: true }),
    ],
  });
}

function skillRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        borders: noBorders,
        width:   { size: 2400, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 0, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Calibri" })] })],
      }),
      new TableCell({
        borders: noBorders,
        width:   { size: 6960, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 0, right: 0 },
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: "Calibri" })] })],
      }),
    ],
  });
}

// ── Build skills table rows from base data ────────────────────────────────────
const skillRows = Object.entries(base.skills).map(([label, value]) => skillRow(label + ":", value));

// ── Build experience nodes ────────────────────────────────────────────────────
const experienceNodes = [];
for (const job of base.experience) {
  experienceNodes.push(jobHeader(job.title, job.company, job.dates));
  for (const b of job.bullets) experienceNodes.push(bullet(b));
}

// ── Build project nodes ───────────────────────────────────────────────────────
const projectNodes = [];
for (const proj of base.projects) {
  projectNodes.push(projectHeader(proj.title, proj.subtitle));
  for (const b of proj.bullets) projectNodes.push(bullet(b));
}

// ── Build education nodes ─────────────────────────────────────────────────────
const educationNodes = base.education.map(edu =>
  new Paragraph({
    spacing: { before: 80, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: edu.degree,              bold: true, size: 21, font: "Calibri" }),
      new TextRun({ text: "  —  " + edu.school,    size: 20,   font: "Calibri", italics: true }),
      new TextRun({ text: "\t" + edu.details,      size: 20,   font: "Calibri", color: "555555" }),
    ],
  })
);

// ── Assemble document ─────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 240 } } },
      }],
    }],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 20 } } },
  },
  sections: [{
    properties: {
      page: {
        size:   { width: 12240, height: 15840 },
        margin: { top: 900, right: 1080, bottom: 900, left: 1080 },
      },
    },
    children: [

      // ── NAME ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing:   { before: 0, after: 60 },
        children:  [new TextRun({ text: base.name, bold: true, size: 36, font: "Calibri", color: "2E4057" })],
      }),

      // ── CONTACT LINE ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing:   { before: 0, after: 40 },
        children: [
          new TextRun({ text: `${base.contact.location}  •  ${base.contact.phone}  •  ${base.contact.email}  •  `, size: 19, font: "Calibri", color: "444444" }),
          new ExternalHyperlink({
            link: base.contact.linkedinUrl,
            children: [new TextRun({ text: base.contact.linkedin, size: 19, font: "Calibri", color: "1155CC", underline: { type: UnderlineType.SINGLE } })],
          }),
          new TextRun({ text: "  •  ", size: 19, font: "Calibri", color: "444444" }),
          new ExternalHyperlink({
            link: base.contact.githubUrl,
            children: [new TextRun({ text: base.contact.github, size: 19, font: "Calibri", color: "1155CC", underline: { type: UnderlineType.SINGLE } })],
          }),
        ],
      }),

      // ── HEADER DIVIDER ──
      new Paragraph({
        border:   { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E4057", space: 1 } },
        spacing:  { before: 60, after: 100 },
        children: [],
      }),

      // ── SUMMARY (tailored) ──
      sectionHeader("Professional Summary"),
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: summary, size: 20, font: "Calibri" })],
      }),

      // ── TECHNICAL SKILLS ──
      ...dividerAndHeader("Technical Skills"),
      new Table({
        width:        { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [2400, 6960],
        rows:         skillRows,
      }),

      // ── PROFESSIONAL EXPERIENCE ──
      ...dividerAndHeader("Professional Experience"),
      ...experienceNodes,

      // ── PROJECTS ──
      ...dividerAndHeader("Projects"),
      ...projectNodes,

      // ── EDUCATION ──
      ...dividerAndHeader("Education"),
      ...educationNodes,

    ],
  }],
});

// ── Write file ────────────────────────────────────────────────────────────────
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  process.stdout.write(outputPath + '\n');
}).catch(err => {
  process.stderr.write(`[build_resume_dynamic] Error: ${err.message}\n`);
  process.exit(1);
});
