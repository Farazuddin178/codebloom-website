/**
 * CodeBloomAPP — saves "Book a free demo" form submissions into this Google Sheet.
 *
 * Paste this file into the Sheet's Apps Script editor (Extensions → Apps Script),
 * then deploy it as a web app. Full steps: README.md → "Booking form → Google Sheet".
 */

const SHEET_NAME = 'Demo bookings';

// Column heading → form field name sent by public/assets/site.js
const COLUMNS = [
  ['Submitted at', null],
  ['Parent name', 'parentName'],
  ['Student name', 'studentName'],
  ['Phone', 'phone'],
  ['Email', 'email'],
  ['Student age', 'studentAge'],
  ['Course', 'course'],
  ['Preferred time', 'preferredTime'],
  ['Has laptop', 'hasLaptop'],
  ['Message', 'message'],
  ['Page', 'page']
];

function doPost(e) {
  const params = (e && e.parameter) || {};

  // Hidden field that only bots fill in: pretend it worked, save nothing
  if (params.website) return respond({ result: 'success' });

  if (!params.parentName || !params.studentName || !params.phone || !params.email) {
    return respond({ result: 'error', error: 'Missing required fields' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const row = COLUMNS.map(([, key]) => (key ? clean(params[key]) : new Date()));
    getSheet().appendRow(row);
    return respond({ result: 'success' });
  } catch (err) {
    return respond({ result: 'error', error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Opening the web app URL in a browser shows this, which confirms the deployment works
function doGet() {
  return respond({ result: 'ok', message: 'CodeBloomAPP booking endpoint is running.' });
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS.map(([label]) => label));
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Trim, cap the length, and stop values such as "+91 98765…" or "=SUM(…)" being read as formulas
function clean(value) {
  const text = String(value || '').trim().slice(0, 1000);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the editor (select it, then click Run) to check the sheet gets a row
function testBooking() {
  const reply = doPost({
    parameter: {
      parentName: 'Test Parent',
      studentName: 'Test Student',
      phone: '+91 98765 43210',
      email: 'test@example.com',
      studentAge: '9–11 years',
      course: 'Python Programming',
      preferredTime: 'Weekend',
      hasLaptop: 'Yes',
      message: 'Test row — safe to delete',
      page: 'testBooking()'
    }
  });
  Logger.log(reply.getContent());
}
