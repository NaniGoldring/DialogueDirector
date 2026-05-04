// =============================================================================
// Google Apps Script backend for the audio evaluation poll.
//
// Setup (one-time, ~3 minutes):
//   1. Open https://sheets.google.com and create a new blank sheet. Name it
//      whatever you want (e.g. "Audio Eval Responses").
//   2. In that sheet:  Extensions -> Apps Script.
//   3. Delete the default code in Code.gs and paste this entire file in.
//   4. Click "Save" (the floppy-disk icon).
//   5. Click "Deploy" (top right) -> "New deployment".
//        - "Select type" gear -> "Web app".
//        - Description: anything (e.g. "audio eval v1").
//        - Execute as:    Me (your account).
//        - Who has access: Anyone (NOT "Anyone with Google account").
//        - Click "Deploy". Approve the OAuth prompt the first time.
//   6. Copy the "Web app URL" (looks like
//      https://script.google.com/macros/s/AKfycb.../exec ).
//   7. Paste it into samples.js as the SUBMIT_URL value:
//        window.SUBMIT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
//
// On every submission, one row per response is appended to the active sheet,
// with the columns shown in HEADERS below.
//
// If you re-deploy after editing this file, use "Manage deployments" ->
// pencil icon -> Version: New version, so the URL stays the same.
// =============================================================================

const HEADERS = [
  "submitted_at",
  "respondent_id",     // anonymous per-session ID — groups all rows from one listener
  "sample_id",         // which dialogue (key from human_eval20/manifest.json)
  "chosen_model",      // model name the listener picked, or "tie"
  "choice",            // "a" | "b" | "tie"  — which UI clip the listener picked
  "model_a",           // model that produced the (a) clip on this question
  "model_b",           // model that produced the (b) clip on this question
  "opponent",          // which competitor model "ours" was paired against this question
  "winner",            // "ours" | "opponent" | "tie"
  "ours_side",         // "a" | "b"  — which UI side held the "ours" clip
  "question_index",
  "user_agent",
];

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    ensureHeader_(sheet);

    const rows = (data.responses || []).map(r => [
      data.submitted_at || new Date().toISOString(),
      data.respondent_id || "",
      r.sample_id || "",
      r.chosen_model || "",
      r.choice || "",
      r.model_a || "",
      r.model_b || "",
      r.opponent || "",
      r.winner || "",
      r.ours_side || "",
      r.index === undefined ? "" : r.index,
      data.user_agent || "",
    ]);

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
           .setValues(rows);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, written: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Lets you sanity-check the deployment by visiting the URL in a browser.
function doGet() {
  return ContentService
    .createTextOutput("Audio eval endpoint is alive.")
    .setMimeType(ContentService.MimeType.TEXT);
}
