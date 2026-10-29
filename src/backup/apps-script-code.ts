/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const APPS_SCRIPT_CODE_GS = `/**
 * Google Apps Script Web App untuk AI Account Manager (PWA)
 * Versi: 2.0 (Optimized & Hardened)
 * 
 * LANGKAH DEPLOYMENT:
 * 1. Buka https://script.google.com dan klik "+ Proyek baru".
 * 2. Hapus kode default dan tempel SELURUH skrip ini ke Code.gs.
 * 3. Ubah AUTH_SECRET_KEY di bawah dengan kunci rahasia Anda sendiri.
 * 4. Klik tombol "Deploy" (kanan atas) > "Deployment baru".
 * 5. Pilih jenis deployment "Web app" (ikon roda gigi).
 * 6. Set "Jalankan sebagai" (Execute as): "Saya" (Me).
 * 7. Set "Siapa yang memiliki akses" (Who has access): "Siapa saja" (Anyone).
 * 8. Klik "Deploy", izinkan akses Google jika diminta, lalu salin "URL Aplikasi Web" (berakhiran /exec)
 *    ke kolom Endpoint di aplikasi AI Account Manager PWA Anda.
 */

// Kunci rahasia default (Ubah sesuai keinginan Anda atau atur di Script Properties)
var AUTH_SECRET_KEY = "GANTI_DENGAN_KUNCI_RAHASIA_ANDA";

var SCHEMAS = {
  metadata: ['key', 'value', 'updatedAt'],
  services: ['id', 'name', 'urlTemplate', 'usesAuthuser', 'resetRule', 'createdAt', 'updatedAt'],
  persons:  ['id', 'ownerName', 'googleEmail', 'label', 'note', 'createdAt', 'updatedAt'],
  access:   ['id', 'personId', 'serviceId', 'loginMethod', 'loginName', 'status', 'limitedAt', 'resetAt', 'activeSessionStart', 'createdAt', 'updatedAt'],
  logs:     ['id', 'accessId', 'type', 'at', 'durationSec', 'detail'],
  handoff:  ['id', 'serviceId', 'accessId', 'authorName', 'text', 'createdAt']
};

var JSON_COLS = {
  services: ['resetRule']
};

var TYPES = {
  services: { usesAuthuser: 'bool' },
  logs: { durationSec: 'num' }
};

function doGet(e) {
  return createJsonResponse({
    status: "ok",
    version: "2.0.0",
    message: "AI Account Manager Apps Script Web App aktif. Gunakan POST untuk berinteraksi.",
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ success: false, error: "Bad Request: Body permintaan kosong." }, 400);
    }

    var requestData = {};
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ success: false, error: "Format JSON tidak valid: " + parseErr.message }, 400);
    }

    var providedSecret = (requestData.secret || "").trim();
    var scriptProps = PropertiesService.getScriptProperties();
    var configuredSecret = (scriptProps.getProperty("AUTH_SECRET_KEY") || AUTH_SECRET_KEY).trim();

    if (!providedSecret || providedSecret !== configuredSecret) {
      return createJsonResponse({ 
        success: false, 
        error: "Akses Ditolak: Kunci rahasia salah atau tidak cocok." 
      }, 403);
    }

    var action = requestData.action || "ping";
    var ss = getOrCreateSpreadsheet(scriptProps);

    if (action === "ping") {
      var sheetsInfo = [];
      var sheets = ss.getSheets();
      for (var s = 0; s < sheets.length; s++) {
        var sh = sheets[s];
        sheetsInfo.push({
          name: sh.getName(),
          rowCount: Math.max(0, sh.getLastRow() - 1)
        });
      }

      return createJsonResponse({
        success: true,
        message: "Pong! Koneksi Apps Script Web App berhasil terverifikasi.",
        timestamp: new Date().toISOString(),
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        tabs: sheetsInfo
      });
    }

    if (action === "backup") {
      var backupData = requestData.data || {};
      var nowIso = new Date().toISOString();

      var metaRows = [
        { key: "appName", value: "AI Account Manager (PWA)", updatedAt: nowIso },
        { key: "appVersion", value: "1.1.0", updatedAt: nowIso },
        { key: "lastBackupAt", value: nowIso, updatedAt: nowIso },
        { key: "resetTimezone", value: (backupData.settings && backupData.settings.resetTimezone) || "America/Los_Angeles", updatedAt: nowIso },
        { key: "maxPersons", value: String((backupData.settings && backupData.settings.maxPersons) || 10), updatedAt: nowIso }
      ];

      var countServices = writeToSheet(ss, "services", backupData.services || []);
      var countPersons  = writeToSheet(ss, "persons", backupData.persons || []);
      var countAccess   = writeToSheet(ss, "access", backupData.access || []);
      var countLogs     = writeToSheet(ss, "logs", backupData.logs || []);
      var countHandoff  = writeToSheet(ss, "handoff", backupData.handoffNotes || []);
      writeToSheet(ss, "metadata", metaRows);

      return createJsonResponse({
        success: true,
        message: "Pencadangan berhasil! Data tersimpan di spreadsheet Google Sheets.",
        backupTimestamp: nowIso,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        counts: {
          services: countServices,
          persons: countPersons,
          access: countAccess,
          logs: countLogs,
          handoffNotes: countHandoff,
          total: countServices + countPersons + countAccess + countLogs + countHandoff
        }
      });
    }

    if (action === "restore") {
      var restoredServices = readFromSheet(ss, "services");
      var restoredPersons  = readFromSheet(ss, "persons");
      var restoredAccess   = readFromSheet(ss, "access");
      var restoredLogs     = readFromSheet(ss, "logs");
      var restoredHandoff  = readFromSheet(ss, "handoff");
      var restoredMeta     = readFromSheet(ss, "metadata");

      var settingsObj = {
        resetTimezone: "America/Los_Angeles",
        maxPersons: 10,
        updatedAt: new Date().toISOString()
      };

      for (var m = 0; m < restoredMeta.length; m++) {
        var row = restoredMeta[m];
        if (row.key === "resetTimezone" && row.value) {
          settingsObj.resetTimezone = row.value;
        } else if (row.key === "maxPersons" && row.value) {
          settingsObj.maxPersons = Number(row.value) || 10;
        }
      }

      var restored = {
        services: restoredServices,
        persons: restoredPersons,
        access: restoredAccess,
        logs: restoredLogs,
        handoffNotes: restoredHandoff,
        settings: settingsObj
      };

      return createJsonResponse({
        success: true,
        message: "Data berhasil dipulihkan dari Google Sheets.",
        data: restored,
        counts: {
          services: restoredServices.length,
          persons: restoredPersons.length,
          access: restoredAccess.length,
          logs: restoredLogs.length,
          handoffNotes: restoredHandoff.length
        }
      });
    }

    return createJsonResponse({ success: false, error: "Aksi tidak dikenal: " + action }, 400);

  } catch (err) {
    return createJsonResponse({ 
      success: false, 
      error: "Kesalahan server Apps Script: " + (err.message || err.toString()) 
    }, 500);
  }
}

function getOrCreateSpreadsheet(scriptProps) {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }

  if (ss) return ss;

  var storedId = scriptProps.getProperty("SPREADSHEET_ID");
  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (openErr) {}
  }

  var newSs = SpreadsheetApp.create("AI_Account_Manager_Backup");
  scriptProps.setProperty("SPREADSHEET_ID", newSs.getId());
  return newSs;
}

function writeToSheet(ss, sheetName, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clear();

  var headers = SCHEMAS[sheetName] || (rows && rows.length > 0 ? Object.keys(rows[0]) : []);
  if (!headers || headers.length === 0) {
    sheet.appendRow(["_empty"]);
    return 0;
  }

  if (!rows || rows.length === 0) {
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headers.length);
    return 0;
  }

  var dataMatrix = [headers];
  var jsonCols = JSON_COLS[sheetName] || [];

  for (var i = 0; i < rows.length; i++) {
    var rowObj = rows[i];
    var rowValues = [];
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      var val = rowObj[h];
      if (val === undefined || val === null) {
        rowValues.push("");
      } else if (jsonCols.indexOf(h) >= 0) {
        rowValues.push(JSON.stringify(val));
      } else {
        var strVal = String(val);
        if (/^[=+\-@]/.test(strVal)) {
          rowValues.push("'" + strVal);
        } else {
          rowValues.push(strVal);
        }
      }
    }
    dataMatrix.push(rowValues);
  }

  var range = sheet.getRange(1, 1, dataMatrix.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(dataMatrix);

  formatHeaderRow(sheet, headers.length);

  try {
    sheet.autoResizeColumns(1, headers.length);
  } catch (resizeErr) {}

  return rows.length;
}

function formatHeaderRow(sheet, colCount) {
  try {
    sheet.setFrozenRows(1);
    var headerRange = sheet.getRange(1, 1, 1, colCount);
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#f8fafc");
    headerRange.setFontWeight("bold");
    headerRange.setFontFamily("Roboto");
  } catch (e) {}
}

function readFromSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var headers = SCHEMAS[sheetName];
  if (!headers) {
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return [];
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }

  if (lastRow < 2) return [];

  var rawData = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
  var result = [];
  var jsonCols = JSON_COLS[sheetName] || [];
  var typeMap = TYPES[sheetName] || {};

  for (var i = 0; i < rawData.length; i++) {
    var item = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      var rawVal = rawData[i][j];
      if (rawVal === "" || rawVal === undefined) {
        continue;
      }

      if (rawVal.charAt(0) === "'" && /^[=+\-@]/.test(rawVal.substring(1))) {
        rawVal = rawVal.substring(1);
      }

      if (jsonCols.indexOf(key) >= 0) {
        try {
          item[key] = JSON.parse(rawVal);
        } catch (e) {
          item[key] = rawVal;
        }
      } else if (typeMap[key] === 'bool') {
        item[key] = (rawVal.toLowerCase() === 'true');
      } else if (typeMap[key] === 'num') {
        item[key] = Number(rawVal);
      } else {
        item[key] = rawVal;
      }
    }
    result.push(item);
  }

  return result;
}

function createJsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
`;
