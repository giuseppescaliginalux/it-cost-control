/**
 * ============================================================================
 * FINOPS ENTERPRISE: DATABASE & CACHE ENGINE
 * ============================================================================
 */

const FinOpsCache = {
  put: function (key, value) {
    try {
      const cache = CacheService.getScriptCache();
      const str = JSON.stringify(value);
      const chunkSize = 90000;
      const chunks = Math.ceil(str.length / chunkSize);

      // Prepariamo un singolo oggetto contenente tutti i chunk
      const bulkData = {};
      bulkData[key + "_CHUNKS"] = chunks.toString();

      for (let i = 0; i < chunks; i++) {
        bulkData[key + "_" + i] = str.substring(i * chunkSize, (i + 1) * chunkSize);
      }

      // 🚀 Scrittura BULK: Una singola chiamata di rete
      cache.putAll(bulkData, 21600);
    } catch (e) { console.warn("Cache write failed:", e); }
  },

  get: function (key) {
    try {
      const cache = CacheService.getScriptCache();
      const chunksStr = cache.get(key + "_CHUNKS");
      if (!chunksStr) return null;

      const chunks = parseInt(chunksStr, 10);
      const keysToFetch = [];

      for (let i = 0; i < chunks; i++) {
        keysToFetch.push(key + "_" + i);
      }

      // 🚀 Lettura BULK: Una singola chiamata di rete per tutti i frammenti
      const cachedValues = cache.getAll(keysToFetch);

      let str = "";
      for (let i = 0; i < chunks; i++) {
        const chunk = cachedValues[key + "_" + i];
        if (!chunk) return null;
        str += chunk;
      }
      return JSON.parse(str);
    } catch (e) { return null; }
  },

  clear: function (key) {
    try {
      const cache = CacheService.getScriptCache();
      const chunksStr = cache.get(key + "_CHUNKS");

      if (chunksStr) {
        const chunks = parseInt(chunksStr, 10);
        const keysToRemove = [key + "_CHUNKS"];

        for (let i = 0; i < chunks; i++) {
          keysToRemove.push(key + "_" + i);
        }

        // 🚀 Cancellazione BULK: Una singola chiamata di rete
        cache.removeAll(keysToRemove);
      }
    } catch (e) { }
  }
};

const FinOpsDatabase = {
  cache: {},
  dirtySheets: new Set(),
  isPreloaded: false,

  preloadAll: function () {
    if (this.isPreloaded) return;
    const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const sheetNames = Object.values(CONFIG.SHEETS);

    try {
      console.time("☁️ RETE: batchGet (Scarica tutto il DB)");
      const response = Sheets.Spreadsheets.Values.batchGet(ssId, {
        ranges: sheetNames,
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING"
      });
      console.timeEnd("☁️ RETE: batchGet (Scarica tutto il DB)");

      console.time("🧠 RAM: Allocazione array in memoria");
      if (response && response.valueRanges) {
        response.valueRanges.forEach((valueRange, index) => {
          const sheetName = sheetNames[index];
          const data = valueRange.values || [];
          const headers = data.length > 0 ? data[0].map(h => String(h).trim()) : [];
          this.cache[sheetName] = { sheet: null, data: data, headers: headers };
        });
      }
      this.isPreloaded = true;
      console.timeEnd("🧠 RAM: Allocazione array in memoria");
    } catch (e) {
      throw new Error("Sheets API fallita: " + e.message);
    }
  },

  getContext: function (sheetName) {
    if (!this.isPreloaded) this.preloadAll();
    return this.cache[sheetName] || { sheet: null, data: [], headers: [] };
  },

  getObjects: function (sheetName) {
    const ctx = this.getContext(sheetName);
    if (ctx.data.length <= 1) return [];

    console.time(`🔄 MAPPER: Formattazione righe per [${sheetName}]`);
    const objects = [];
    for (let i = 1; i < ctx.data.length; i++) {
      const row = ctx.data[i];
      const obj = {};
      ctx.headers.forEach((header, index) => {
        let val = row[index];
        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          obj[header] = String(val);
        } else {
          let possibleDate = formatServerDate(val);
          obj[header] = possibleDate !== "" ? possibleDate : (val !== undefined && val !== null ? val : "");
        }
      });
      objects.push(obj);
    }
    console.timeEnd(`🔄 MAPPER: Formattazione righe per [${sheetName}]`);
    return objects;
  },

  setObjects: function (sheetName, dataObjectsArray, fieldMap, appendMode = false) {
    const ctx = this.getContext(sheetName);
    if (!ctx.headers || ctx.headers.length === 0) return;

    const newRows = dataObjectsArray.map(obj => {
      return ctx.headers.map(header => {
        if (fieldMap && fieldMap[header]) {
          const prop = fieldMap[header];
          return obj[prop] !== undefined ? obj[prop] : (obj[header] !== undefined ? obj[header] : "");
        }
        return obj[header] !== undefined ? obj[header] : "";
      });
    });

    if (appendMode) ctx.data = ctx.data.concat(newRows);
    else ctx.data = [ctx.headers, ...newRows];

    this.dirtySheets.add(sheetName);
  },

  deleteRowsByColumnValue: function (sheetName, columnName, valuesToDelete) {
    const ctx = this.getContext(sheetName);
    if (ctx.data.length <= 1 || valuesToDelete.length === 0) return;
    const colIdx = ctx.headers.indexOf(columnName);
    if (colIdx === -1) return;

    const filteredData = [ctx.headers];
    for (let i = 1; i < ctx.data.length; i++) {
      if (!valuesToDelete.includes(String(ctx.data[i][colIdx]).trim())) {
        filteredData.push(ctx.data[i]);
      }
    }
    ctx.data = filteredData;
    this.dirtySheets.add(sheetName);
  },

  updateOrAppendRowByColumnValue: function (sheetName, columnName, matchValue, dataObject, fieldMap) {
    const ctx = this.getContext(sheetName);
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
    if (this.dirtySheets.size === 0) return;

    const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const clearRanges = [];
    const dataToWrite = [];

    console.time("🛠️ COMMIT: Preparazione Dati Istruzioni");
    this.dirtySheets.forEach(sheetName => {
      const ctx = this.cache[sheetName];
      if (ctx) {
        clearRanges.push(sheetName + "!A2:Z");
        if (ctx.data.length > 1) {
          dataToWrite.push({ range: sheetName + "!A2", values: ctx.data.slice(1) });
        }
      }
    });
    console.timeEnd("🛠️ COMMIT: Preparazione Dati Istruzioni");

    try {
      console.time("☁️ RETE: batchClear (Svuotamento griglie)");
      if (clearRanges.length > 0) Sheets.Spreadsheets.Values.batchClear({ ranges: clearRanges }, ssId);
      console.timeEnd("☁️ RETE: batchClear (Svuotamento griglie)");

      console.time("☁️ RETE: batchUpdate (Scrittura fisica DB)");
      if (dataToWrite.length > 0) Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: "USER_ENTERED", data: dataToWrite }, ssId);
      console.timeEnd("☁️ RETE: batchUpdate (Scrittura fisica DB)");

      this.dirtySheets.clear();
    } catch (e) {
      throw new Error("Salvataggio fallito tramite Advanced API: " + e.message);
    }
  }
};

function formatServerDate(val) {
  if (val === undefined || val === null || val === "") return "";
  if (typeof val === 'number' || typeof val === 'boolean') return "";

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }

  let s = String(val).trim();
  if (s === "" || s === "—" || s === "-") return "";

  // ⚡ GUARDIA FONDAMENTALE ANTI-CORRUZIONE ID:
  // Se la stringa inizia con un prefisso di testo seguito da un trattino (es: MCT-, CTR-, TMP-, INIT-)
  // è un identificativo relazionale del database, quindi NON deve mai essere interpretato come data!
  if (/^[A-Z]+-/i.test(s)) return "";

  if (!s.includes('/') && !s.includes('-') && !s.includes(' ')) return "";

  let isoMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  let euMatch = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;

  let dObj = new Date(s);
  if (!isNaN(dObj.getTime())) return `${dObj.getTime() === 0 ? '' : dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;

  return "";
}

// Wrapper retrocompatibili dinamici
function getSheetContext(arg1, arg2) { return FinOpsDatabase.getContext(arg2 || arg1); }
function getSheetDataAsObjects(arg1, arg2) { return FinOpsDatabase.getObjects(arg2 || arg1); }