/**
 * Copy a Google Sheet tab into another spreadsheet.
 *
 * People you share the destination with do not need access to the source.
 * The Google account that runs this script still must be able to open the
 * source (Viewer is enough) and edit the destination. Google will not open
 * a spreadsheet this account cannot already see.
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
  sourceSheetName: 'Sheet1',

  // Leave blank to write into the spreadsheet this script is bound to.
  destinationSpreadsheetId: 'DESTINATION_SPREADSHEET_ID',
  destinationSheetName: 'Sheet1',

  // 'values'             computed cell values only (safe, self-contained copy)
  // 'valuesAndFormats'   values plus number formats, fonts, colors, widths, merges
  // 'wholeSheet'         full tab copy. An existing destination tab is overwritten
  //                      in place so its id and position stay put.
  mode: 'valuesAndFormats'
};

/**
 * Entry point. Run this from the Apps Script editor.
 */
function copySheet() {
  var sourceSheet = openSheet_(CONFIG.sourceSpreadsheetId, CONFIG.sourceSheetName, 'source');
  var destSpreadsheet = openDestinationSpreadsheet_();

  if (CONFIG.mode === 'wholeSheet') {
    replaceSheetWithCopy_(sourceSheet, destSpreadsheet, CONFIG.destinationSheetName);
    return;
  }

  var destSheet = destSpreadsheet.getSheetByName(CONFIG.destinationSheetName);
  if (!destSheet) {
    destSheet = destSpreadsheet.insertSheet(CONFIG.destinationSheetName);
  }

  copyRange_(sourceSheet, destSheet, CONFIG.mode === 'valuesAndFormats');
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

function openSheet_(spreadsheetId, sheetName, label) {
  if (!spreadsheetId || spreadsheetId.indexOf('SPREADSHEET_ID') !== -1) {
    throw new Error('Set the ' + label + ' spreadsheet id in CONFIG.');
  }
  var spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error(
      'Cannot open the ' + label + ' spreadsheet. Share it with the account running this script. ' +
      error.message
    );
  }
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(label + ' sheet not found: ' + sheetName);
  }
  return sheet;
}

function copyRange_(sourceSheet, destSheet, withFormats) {
  var source = sourceSheet.getDataRange();
  var values = source.getValues();
  var rowCount = values.length;
  var colCount = rowCount ? values[0].length : 0;
  var empty = !rowCount || !colCount || (rowCount === 1 && colCount === 1 && values[0][0] === '');

  // clearContents leaves merges in place, and setValues cannot write through them.
  unmergeAll_(destSheet);
  if (!empty) {
    ensureGrid_(destSheet, rowCount, colCount);
  }

  destSheet.clearContents();
  if (withFormats) {
    destSheet.clearFormats();
  }
  if (empty) {
    return;
  }

  var target = destSheet.getRange(1, 1, rowCount, colCount);
  target.setValues(values);

  if (!withFormats) {
    return;
  }

  target.setNumberFormats(source.getNumberFormats());
  target.setFontWeights(source.getFontWeights());
  target.setFontStyles(source.getFontStyles());
  target.setFontColors(source.getFontColors());
  target.setBackgrounds(source.getBackgrounds());
  target.setHorizontalAlignments(source.getHorizontalAlignments());
  target.setVerticalAlignments(source.getVerticalAlignments());
  target.setWraps(source.getWraps());
  copyMerges_(source, destSheet);
  copyDimensions_(sourceSheet, destSheet, rowCount, colCount);
}

function replaceSheetWithCopy_(sourceSheet, destSpreadsheet, destName) {
  var existing = destSpreadsheet.getSheetByName(destName);
  var copied = sourceSheet.copyTo(destSpreadsheet);
  if (!existing) {
    copied.setName(destName);
    return;
  }

  // Keep the existing tab. Deleting it would change its id, break formulas on
  // other tabs, and leave the replacement at the end of the spreadsheet.
  overwriteSheetFrom_(copied, existing);
  destSpreadsheet.deleteSheet(copied);
}

function overwriteSheetFrom_(sourceSheet, destSheet) {
  var source = sourceSheet.getDataRange();
  var rowCount = source.getNumRows();
  var colCount = source.getNumColumns();
  var empty = rowCount === 1 && colCount === 1 && source.getCell(1, 1).getValue() === '';

  unmergeAll_(destSheet);
  destSheet.clear();
  if (empty) {
    return;
  }

  ensureGrid_(destSheet, rowCount, colCount);
  source.copyTo(destSheet.getRange(1, 1));
  copyDimensions_(sourceSheet, destSheet, rowCount, colCount);
  copyFrozen_(sourceSheet, destSheet);
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

function copyMerges_(sourceRange, destSheet) {
  var merges = sourceRange.getMergedRanges();
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

function copyDimensions_(sourceSheet, destSheet, rowCount, colCount) {
  for (var column = 1; column <= colCount; column++) {
    destSheet.setColumnWidth(column, sourceSheet.getColumnWidth(column));
  }
  for (var row = 1; row <= rowCount; row++) {
    destSheet.setRowHeight(row, sourceSheet.getRowHeight(row));
  }
}

function copyFrozen_(sourceSheet, destSheet) {
  var frozenRows = sourceSheet.getFrozenRows();
  var frozenColumns = sourceSheet.getFrozenColumns();
  if (frozenRows >= destSheet.getMaxRows()) {
    frozenRows = Math.max(0, destSheet.getMaxRows() - 1);
  }
  if (frozenColumns >= destSheet.getMaxColumns()) {
    frozenColumns = Math.max(0, destSheet.getMaxColumns() - 1);
  }
  destSheet.setFrozenRows(frozenRows);
  destSheet.setFrozenColumns(frozenColumns);
}
