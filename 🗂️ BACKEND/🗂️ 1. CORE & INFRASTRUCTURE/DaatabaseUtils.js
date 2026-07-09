/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: IN-MEMORY DATABASE UTILITIES
 * ============================================================================
 * Implementa il pattern "Unit of Work". Tutte le letture/scritture avvengono
 * in RAM. Solo il comando commit() scarica i dati fisicamente sui fogli Google.
 * ============================================================================
 */

const FinOpsDatabase = {
  cache: {},
  dirtySheets: new Set(),

  getContext: function (sheetName) {
    if (!this.cache[sheetName]) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return { sheet: null, data: [], headers: [] };
      const data = sheet.getDataRange().getValues();
      const headers = data.length > 0 ? data[0].map(h => String(h).trim()) : [];
      this.cache[sheetName] = { sheet, data, headers };
    }
    return this.cache[sheetName];
  },

  getObjects: function (sheetName) {
    const ctx = this.getContext(sheetName);
    if (!ctx.sheet || ctx.data.length <= 1) return [];
    const objects = [];
    for (let i = 1; i < ctx.data.length; i++) {
      const row = ctx.data[i];
      const obj = {};
      ctx.headers.forEach((header, index) => {
        let val = row[index];
        if (val instanceof Date) obj[header] = formatServerDate(val);
        else obj[header] = val !== undefined && val !== null ? val : "";
      });
      objects.push(obj);
    }
    return objects;
  },

  setObjects: function (sheetName, dataObjectsArray, fieldMap, appendMode = false) {
    const ctx = this.getContext(sheetName);
    if (!ctx.sheet) return;

    const newRows = dataObjectsArray.map(obj => {
      return ctx.headers.map(header => {
        if (fieldMap && fieldMap[header]) {
          const prop = fieldMap[header];
          return obj[prop] !== undefined ? obj[prop] : (obj[header] !== undefined ? obj[header] : "");
        }
        return obj[header] !== undefined ? obj[header] : "";
      });
    });

    if (appendMode) {
      ctx.data = ctx.data.concat(newRows);
    } else {
      ctx.data = [ctx.headers, ...newRows];
    }
    this.dirtySheets.add(sheetName);
  },

  deleteRowsByColumnValue: function (sheetName, columnName, valuesToDelete) {
    const ctx = this.getContext(sheetName);
    if (!ctx.sheet || ctx.data.length <= 1 || valuesToDelete.length === 0) return;
    const colIdx = ctx.headers.indexOf(columnName);
    if (colIdx === -1) return;

    const filteredData = [ctx.headers];
    for (let i = 1; i < ctx.data.length; i++) {
      const val = String(ctx.data[i][colIdx]).trim();
      if (!valuesToDelete.includes(val)) {
        filteredData.push(ctx.data[i]);
      }
    }
    ctx.data = filteredData;
    this.dirtySheets.add(sheetName);
  },

  updateOrAppendRowByColumnValue: function (sheetName, columnName, matchValue, dataObject, fieldMap) {
    const ctx = this.getContext(sheetName);
    if (!ctx.sheet) return;
    const colIdx = ctx.headers.indexOf(columnName);
    if (colIdx === -1) return;

    const newRow = ctx.headers.map(header => {
      if (fieldMap && fieldMap[header]) {
        const prop = fieldMap[header];
        return dataObject[prop] !== undefined ? dataObject[prop] : (dataObject[header] !== undefined ? dataObject[header] : "");
      }
      return dataObject[header] !== undefined ? dataObject[header] : "";
    });

    let found = false;
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][colIdx]).trim() === String(matchValue).trim()) {
        ctx.data[i] = newRow;
        found = true;
        break;
      }
    }
    if (!found) ctx.data.push(newRow);
    this.dirtySheets.add(sheetName);
  },

  commit: function () {
    this.dirtySheets.forEach(sheetName => {
      const ctx = this.cache[sheetName];
      if (ctx && ctx.sheet) {
        const lastRow = ctx.sheet.getLastRow();
        if (lastRow > 1) {
          ctx.sheet.getRange(2, 1, lastRow - 1, ctx.headers.length).clearContent();
        }
        if (ctx.data.length > 1) {
          const rowsToWrite = ctx.data.slice(1);
          ctx.sheet.getRange(2, 1, rowsToWrite.length, ctx.headers.length).setValues(rowsToWrite);
        }
      }
    });
    this.dirtySheets.clear();
    console.log("DATABASE: Commit massivo completato con successo in O(1).");
  }
};

function formatServerDate(val) {
  if (val === undefined || val === null) return "";

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    // 🌟 FIX LATENZA: Matematica pura JS, zero chiamate API a Google
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  let s = String(val).trim();
  if (s === "" || s === "—" || s === "-") return "";

  let isoMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  let dObj = new Date(s);
  if (!isNaN(dObj.getTime())) {
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return s;
}

// Override functions to transparently use the RAM Database
function getSheetContext(sheetName) { return FinOpsDatabase.getContext(sheetName); }
function getSheetDataAsObjects(ss, sheetName) { return FinOpsDatabase.getObjects(sheetName); }