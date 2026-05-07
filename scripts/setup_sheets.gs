/**
 * HarryJobBuddy — Google Sheets Dashboard Setup
 *
 * HOW TO USE:
 * 1. Open your Google Sheet (the one linked to n8n)
 * 2. Click Extensions → Apps Script
 * 3. Paste this entire file, replacing any existing code
 * 4. Click Run → setupHarryJobBuddyDashboard
 * 5. Authorize when prompted
 * 6. Done — your 3 sheets are ready
 *
 * Creates 3 sheets:
 *   Applications  — n8n writes here on every apply
 *   Outcomes      — n8n writes here on interview/rejection/offer
 *   Dashboard     — live stats (formula-based, auto-updates)
 */

function setupHarryJobBuddyDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupApplicationsSheet(ss);
  setupOutcomesSheet(ss);
  setupDashboardSheet(ss);

  SpreadsheetApp.getUi().alert(
    '✅ HarryJobBuddy Dashboard ready!\n\n' +
    '3 sheets created: Applications, Outcomes, Dashboard.\n' +
    'n8n will auto-populate Applications and Outcomes.\n' +
    'Dashboard updates live via formulas.'
  );
}

// ── Applications Sheet ────────────────────────────────────────────────────────
function setupApplicationsSheet(ss) {
  let sheet = ss.getSheetByName('Applications');
  if (!sheet) sheet = ss.insertSheet('Applications');
  sheet.clearContents();
  sheet.clearFormats();

  const headers = [
    'Company', 'Role', 'Date Applied', 'Status', 'Source',
    'Score', 'Classification', 'Visa Sponsor', 'Salary', 'Location',
    'Apply Link', 'Keywords', 'Outcome Date', 'Notes'
  ];

  // Header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground('#2E4057');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);

  // Freeze header
  sheet.setFrozenRows(1);

  // Column widths
  const widths = [140, 200, 110, 100, 90, 60, 110, 100, 120, 120, 200, 200, 110, 160];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Conditional formatting for Status column (D)
  const statusRange = sheet.getRange('D2:D1000');
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Applied')
      .setBackground('#FFF9C4').setFontColor('#5D4037')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Interview')
      .setBackground('#C8E6C9').setFontColor('#1B5E20')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Offer')
      .setBackground('#BBDEFB').setFontColor('#0D47A1')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Rejected')
      .setBackground('#FFCDD2').setFontColor('#B71C1C')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Ghosted')
      .setBackground('#F5F5F5').setFontColor('#9E9E9E')
      .setRanges([statusRange]).build(),
  ];
  sheet.setConditionalFormatRules(rules);

  // Conditional formatting for Score column (F)
  const scoreRange = sheet.getRange('F2:F1000');
  const scoreRules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThanOrEqualTo(8)
      .setBackground('#C8E6C9').setFontColor('#1B5E20')
      .setRanges([scoreRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberBetween(5, 7)
      .setBackground('#FFF9C4').setFontColor('#5D4037')
      .setRanges([scoreRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(5)
      .setBackground('#FFCDD2').setFontColor('#B71C1C')
      .setRanges([scoreRange]).build(),
  ];
  sheet.setConditionalFormatRules(sheet.getConditionalFormatRules().concat(scoreRules));

  Logger.log('✅ Applications sheet ready');
}

// ── Outcomes Sheet ────────────────────────────────────────────────────────────
function setupOutcomesSheet(ss) {
  let sheet = ss.getSheetByName('Outcomes');
  if (!sheet) sheet = ss.insertSheet('Outcomes');
  sheet.clearContents();
  sheet.clearFormats();

  const headers = ['Company', 'Role', 'New Status', 'Outcome Date', 'Notes'];

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground('#37474F');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);

  sheet.setFrozenRows(1);
  [150, 200, 110, 110, 200].forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  Logger.log('✅ Outcomes sheet ready');
}

// ── Dashboard Sheet ───────────────────────────────────────────────────────────
function setupDashboardSheet(ss) {
  let sheet = ss.getSheetByName('Dashboard');
  if (!sheet) sheet = ss.insertSheet('Dashboard');
  sheet.clearContents();
  sheet.clearFormats();

  // Move Dashboard to first tab
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);

  // ── Title ──
  sheet.getRange('A1').setValue('📊 HarryJobBuddy Dashboard');
  sheet.getRange('A1').setFontSize(18).setFontWeight('bold').setFontColor('#2E4057');
  sheet.getRange('A1:F1').merge();

  sheet.getRange('A2').setValue('Live job search stats — auto-updated by n8n');
  sheet.getRange('A2').setFontColor('#888888').setFontSize(10);
  sheet.getRange('A2:F2').merge();

  // ── Pipeline section ──
  const pipelineHeader = sheet.getRange('A4:C4');
  pipelineHeader.merge().setValue('PIPELINE').setBackground('#2E4057').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  const pipelineRows = [
    ['Total Applied',     "=COUNTA(Applications!A2:A)"],
    ['This Week',         "=COUNTIFS(Applications!C:C,\">=\"&TEXT(TODAY()-6,\"YYYY-MM-DD\"))"],
    ['Pending Response',  "=COUNTIF(Applications!D:D,\"Applied\")"],
    ['Interviews',        "=COUNTIF(Applications!D:D,\"Interview\")+COUNTIF(Outcomes!C:C,\"Interview\")"],
    ['Offers',            "=COUNTIF(Applications!D:D,\"Offer\")+COUNTIF(Outcomes!C:C,\"Offer\")"],
    ['Rejected',          "=COUNTIF(Applications!D:D,\"Rejected\")+COUNTIF(Outcomes!C:C,\"Rejected\")"],
    ['Ghosted',           "=COUNTIF(Applications!D:D,\"Ghosted\")+COUNTIF(Outcomes!C:C,\"Ghosted\")"],
  ];

  pipelineRows.forEach(([label, formula], i) => {
    const row = 5 + i;
    sheet.getRange(row, 1).setValue(label).setFontWeight('bold');
    sheet.getRange(row, 2).setFormula(formula).setHorizontalAlignment('center')
      .setFontWeight('bold').setFontSize(14).setFontColor('#2E4057');
  });

  // ── Rates section ──
  const ratesRow = 13;
  sheet.getRange(ratesRow, 1, 1, 3).merge().setValue('RATES')
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  const rateRows = [
    ['Response Rate',    "=IF(B5>0,ROUND((B8+B9+B10+B11)/B5*100,1)&\"%\",\"N/A\")"],
    ['Interview Rate',   "=IF(B5>0,ROUND(B8/B5*100,1)&\"%\",\"N/A\")"],
    ['Offer Rate',       "=IF(B5>0,ROUND(B9/B5*100,1)&\"%\",\"N/A\")"],
  ];

  rateRows.forEach(([label, formula], i) => {
    const row = ratesRow + 1 + i;
    sheet.getRange(row, 1).setValue(label).setFontWeight('bold');
    sheet.getRange(row, 2).setFormula(formula).setHorizontalAlignment('center')
      .setFontWeight('bold').setFontSize(13).setFontColor('#2E4057');
  });

  // ── This week section ──
  const weekRow = 18;
  sheet.getRange(weekRow, 1, 1, 3).merge().setValue('THIS WEEK')
    .setBackground('#455A64').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  const weekRows = [
    ['Days Active',      "=SUMPRODUCT((COUNTIFS(Applications!C:C,TEXT(TODAY()-ROW(INDIRECT(\"1:7\"))+1,\"YYYY-MM-DD\")))>0)*1"],
    ['Avg Score',        "=IF(COUNTA(Applications!F2:F)>0,ROUND(AVERAGE(IF(Applications!F2:F<>\"\",Applications!F2:F)),1),\"N/A\")"],
    ['High Match (8+)',  "=COUNTIF(Applications!F:F,\">=\"&8)"],
  ];

  weekRows.forEach(([label, formula], i) => {
    const row = weekRow + 1 + i;
    sheet.getRange(row, 1).setValue(label).setFontWeight('bold');
    const cell = sheet.getRange(row, 2);
    if (formula.includes('SUMPRODUCT') || formula.includes('AVERAGE(IF')) {
      // Array formula
      cell.setValue(formula).setHorizontalAlignment('center')
        .setFontWeight('bold').setFontSize(13).setFontColor('#2E4057');
    } else {
      cell.setFormula(formula).setHorizontalAlignment('center')
        .setFontWeight('bold').setFontSize(13).setFontColor('#2E4057');
    }
  });

  // ── Recent Applications ──
  const recentRow = 23;
  sheet.getRange(recentRow, 1, 1, 5).merge().setValue('RECENT APPLICATIONS (last 10)')
    .setBackground('#2E4057').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  const recentHeaders = ['Company', 'Role', 'Date', 'Status', 'Score'];
  recentHeaders.forEach((h, i) => {
    sheet.getRange(recentRow + 1, i + 1).setValue(h)
      .setFontWeight('bold').setBackground('#ECEFF1');
  });

  // SORT by date desc and show last 10
  const recentFormulas = [
    `=IFERROR(INDEX(Applications!A:A,MATCH(LARGE(IF(Applications!A2:A<>"",ROW(Applications!A2:A)),ROW()-${recentRow+1}),ROW(Applications!A2:A),0)),"")`,
  ];

  // Use simpler approach: just reference last 10 rows
  for (let i = 0; i < 10; i++) {
    const rowNum = recentRow + 2 + i;
    // Company
    sheet.getRange(rowNum, 1).setFormula(`=IFERROR(INDEX(SORT(Applications!A2:N,3,FALSE),${i+1},1),"")`);
    // Role
    sheet.getRange(rowNum, 2).setFormula(`=IFERROR(INDEX(SORT(Applications!A2:N,3,FALSE),${i+1},2),"")`);
    // Date Applied
    sheet.getRange(rowNum, 3).setFormula(`=IFERROR(INDEX(SORT(Applications!A2:N,3,FALSE),${i+1},3),"")`);
    // Status
    sheet.getRange(rowNum, 4).setFormula(`=IFERROR(INDEX(SORT(Applications!A2:N,3,FALSE),${i+1},4),"")`);
    // Score
    sheet.getRange(rowNum, 5).setFormula(`=IFERROR(INDEX(SORT(Applications!A2:N,3,FALSE),${i+1},6),"")`);
  }

  // ── Conditional formatting on Dashboard status column ──
  const dStatusRange = sheet.getRange(`D${recentRow+2}:D${recentRow+11}`);
  const dRules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Interview').setBackground('#C8E6C9').setFontColor('#1B5E20')
      .setRanges([dStatusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Offer').setBackground('#BBDEFB').setFontColor('#0D47A1')
      .setRanges([dStatusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Rejected').setBackground('#FFCDD2').setFontColor('#B71C1C')
      .setRanges([dStatusRange]).build(),
  ];
  sheet.setConditionalFormatRules(dRules);

  // ── Column widths ──
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 60);

  // ── Last updated ──
  const lastRow = recentRow + 13;
  sheet.getRange(lastRow, 1).setFormula('=NOW()').setNumberFormat('MMM d, yyyy HH:mm')
    .setFontColor('#BBBBBB').setFontSize(9);
  sheet.getRange(lastRow - 1, 1).setValue('Last refreshed:')
    .setFontColor('#BBBBBB').setFontSize(9);

  Logger.log('✅ Dashboard sheet ready');
}
