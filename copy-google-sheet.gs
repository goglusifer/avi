/**
 * Copy every sheet from one Google spreadsheet into another.
 *
 * People you share the destination with do not need access to the source.
 * The Google account that runs this script must be able to open the source
 * (Viewer is enough) and edit the destination.
 *
 * Each source tab is copied whole, so formatting, merged cells, charts,
 * images, filters, frozen panes, and column sizes come with it. Formulas are
 * then replaced with the values calculated in the source, so the destination
 * still shows the data if a formula pointed at another tab or at the source
 * file. Destination tabs with the same names are replaced. Tabs that exist
 * only in the destination are left in place.
 *
 * Setup:
 * 1. Open https://script.google.com and create a project (or Extensions >
 *    Apps Script on the destination spreadsheet).
 * 2. Paste this file in, fill in CONFIG, and save.
 * 3. Run copySheet once and approve the Sheets permission prompt.
 * 4. Optional: run installHourlyTrigger to keep the destination updated.
 */

var CONFIG = {
  // From the spreadsheet URL: /spreadsheets/d/<THIS_PART>/edit
  sourceSpreadsheetId: 'SOURCE_SPREADSHEET_ID',

  // Leave blank to write into the spreadsheet this script is bound to.
  destinationSpreadsheetId: 'DESTINATION_SPREADSHEET_ID'
};

/**
 * Entry point. Run this from the Apps Script editor.
 */
function copySheet() {
  var sourceSpreadsheet = openSpreadsheet_(CONFIG.sourceSpreadsheetId, 'source');
  var destSpreadsheet = openDestinationSpreadsheet_();
  if (sourceSpreadsheet.getId() === destSpreadsheet.getId()) {
    throw new Error('Source and destination must be different spreadsheets.');
  }

  var sourceSheets = sourceSpreadsheet.getSheets();
  var copies = [];
  for (var i = 0; i < sourceSheets.length; i++) {
    var sourceSheet = sourceSheets[i];
    var copied = sourceSheet.copyTo(destSpreadsheet);
    // copyTo names the tab "Copy of …", which can collide with a real source
    // tab. Park it under a temporary name before the next copy.
    copied.setName(temporarySheetName_(destSpreadsheet, i));
    writeSourceValues_(sourceSheet, copied);
    copies.push({
      name: sourceSheet.getName(),
      sheet: copied,
      hidden: sourceSheet.isSheetHidden()
    });
  }

  for (var j = 0; j < copies.length; j++) {
    var existing = destSpreadsheet.getSheetByName(copies[j].name);
    if (existing && existing.getSheetId() !== copies[j].sheet.getSheetId()) {
      destSpreadsheet.deleteSheet(existing);
    }
    copies[j].sheet.setName(copies[j].name);
  }

  // Tab order uses the spreadsheet UI, which a timed trigger does not have.
  // The data is already copied, so a failed reorder should not fail the run.
  try {
    for (var k = 0; k < copies.length; k++) {
      destSpreadsheet.setActiveSheet(copies[k].sheet);
      destSpreadsheet.moveActiveSheet(k + 1);
    }
  } catch (reorderError) {
    Logger.log('Sheets were copied, but tab order was left unchanged. ' + reorderError.message);
  }

  for (var h = 0; h < copies.length; h++) {
    if (copies[h].hidden) {
      hideIfPossible_(copies[h].sheet);
    }
  }

  copyNamedRanges_(sourceSpreadsheet, destSpreadsheet);
}

/**
 * Reinstall a single hourly trigger that calls copySheet.
 */
function installHourlyTrigger() {
  var handler = 'copySheet';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
}

function openDestinationSpreadsheet_() {
  var id = CONFIG.destinationSpreadsheetId;
  if (!id || id === 'DESTINATION_SPREADSHEET_ID') {
    var active = SpreadsheetApp.getActive();
    if (!active) {
      throw new Error('Set destinationSpreadsheetId, or bind this script to the destination spreadsheet.');
    }
    return active;
  }
  return SpreadsheetApp.openById(id);
}

function openSpreadsheet_(spreadsheetId, label) {
  if (!spreadsheetId || spreadsheetId.indexOf('SPREADSHEET_ID') !== -1) {
    throw new Error('Set the ' + label + ' spreadsheet id in CONFIG.');
  }
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error(
      'Cannot open the ' + label + ' spreadsheet. Share it with the account running this script. ' +
      error.message
    );
  }
}

/**
 * copyTo keeps formulas. Cross-sheet formulas do not survive the move, so
 * write the values already calculated on the source.
 */
function writeSourceValues_(sourceSheet, destSheet) {
  var lastRow = sourceSheet.getLastRow();
  var lastColumn = sourceSheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return;
  }

  ensureGrid_(destSheet, lastRow, lastColumn);
  unmergeAll_(destSheet);

  var height = chunkHeight_(lastColumn);
  for (var row = 1; row <= lastRow; row += height) {
    var rowCount = Math.min(height, lastRow - row + 1);
    var values = sourceSheet.getRange(row, 1, rowCount, lastColumn).getValues();
    destSheet.getRange(row, 1, rowCount, lastColumn).setValues(values);
  }

  copyMerges_(sourceSheet, destSheet);
}

function copyNamedRanges_(sourceSpreadsheet, destSpreadsheet) {
  var namedRanges = sourceSpreadsheet.getNamedRanges();
  for (var i = 0; i < namedRanges.length; i++) {
    var namedRange = namedRanges[i];
    var sourceRange = namedRange.getRange();
    var destSheet = destSpreadsheet.getSheetByName(sourceRange.getSheet().getName());
    if (!destSheet) {
      continue;
    }
    removeNamedRange_(destSpreadsheet, namedRange.getName());
    destSpreadsheet.setNamedRange(namedRange.getName(), destSheet.getRange(sourceRange.getA1Notation()));
  }
}

function removeNamedRange_(spreadsheet, name) {
  var namedRanges = spreadsheet.getNamedRanges();
  for (var i = 0; i < namedRanges.length; i++) {
    if (namedRanges[i].getName() === name) {
      namedRanges[i].remove();
    }
  }
}

function ensureGrid_(sheet, rows, columns) {
  var maxRows = sheet.getMaxRows();
  var maxColumns = sheet.getMaxColumns();
  if (rows > maxRows) {
    sheet.insertRowsAfter(maxRows, rows - maxRows);
  }
  if (columns > maxColumns) {
    sheet.insertColumnsAfter(maxColumns, columns - maxColumns);
  }
}

function unmergeAll_(sheet) {
  var merges = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).getMergedRanges();
  for (var i = 0; i < merges.length; i++) {
    merges[i].breakApart();
  }
}

function copyMerges_(sourceSheet, destSheet) {
  var merges = sourceSheet.getRange(1, 1, sourceSheet.getMaxRows(), sourceSheet.getMaxColumns()).getMergedRanges();
  for (var i = 0; i < merges.length; i++) {
    var merge = merges[i];
    var mergeRows = merge.getNumRows();
    var mergeColumns = merge.getNumColumns();
    if (mergeRows === 1 && mergeColumns === 1) {
      continue;
    }
    ensureGrid_(destSheet, merge.getLastRow(), merge.getLastColumn());
    destSheet.getRange(merge.getRow(), merge.getColumn(), mergeRows, mergeColumns).merge();
  }
}

function chunkHeight_(columnCount) {
  var maxCells = 50000;
  return Math.max(1, Math.floor(maxCells / Math.max(columnCount, 1)));
}

function temporarySheetName_(spreadsheet, index) {
  var name = 'copy-tmp-' + index + '-' + new Date().getTime();
  while (spreadsheet.getSheetByName(name)) {
    name += 'x';
  }
  return name;
}

function hideIfPossible_(sheet) {
  var sheets = sheet.getParent().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() !== sheet.getSheetId() && !sheets[i].isSheetHidden()) {
      sheet.hideSheet();
      return;
    }
  }
}
