/**
 * Senim -> Google Sheets mirror (Apps Script web app).
 *
 * Setup (owner does this, see docs/SETUP.md):
 *  1. Create a Google Sheet, Extensions -> Apps Script, paste this file.
 *  2. Project Settings -> Script properties: SHARED_SECRET = <long random string>.
 *  3. Deploy -> New deployment -> Web app, Execute as: Me, Who has access: Anyone.
 *  4. Put the web app URL and the same secret into Supabase Vault
 *     (sheets_webhook_url, sheets_webhook_secret).
 *
 * One row per user, upserted by id. "bio" and "links" are never sent by the database.
 */
var SHEET_NAME = 'users';
var COLUMNS = ['id', 'nickname', 'display_name', 'email', 'phone', 'gender', 'city',
               'role', 'status', 'language', 'created_at', 'updated_at', 'synced_at'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || body.secret !== secret) return reply({ ok: false, error: 'forbidden' });

    var p = body.profile || {};
    if (!p.id) return reply({ ok: false, error: 'bad_request' });

    var sheet = getSheet();
    var row = COLUMNS.map(function (c) {
      if (c === 'synced_at') return new Date().toISOString();
      var v = p[c] == null ? '' : String(p[c]);
      // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
      return /^[=+\-@]/.test(v) ? "'" + v : v;
    });

    var ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === p.id) {
        sheet.getRange(i + 2, 1, 1, COLUMNS.length).setValues([row]);
        return reply({ ok: true, updated: true });
      }
    }
    sheet.appendRow(row);
    return reply({ ok: true, inserted: true });
  } catch (err) {
    return reply({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
