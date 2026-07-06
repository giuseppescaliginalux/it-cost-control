/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: DATABASE UTILITIES
 * ============================================================================
 * Fornisce motori di I/O ottimizzati (Bulk Operations) e normalizzatori dati.
 * ============================================================================
 */

/**
 * CORE TIME ENGINE: Centralizza la normalizzazione delle date a livello di Server.
 * Trasforma qualsiasi porcheria (Date, ISO, stringhe estese) in stringhe pure 'YYYY-MM-DD'
 * blindate sul fuso orario locale, azzerando slittamenti o ore spurie.
 * * @param {any} val - Il valore grezzo della data.
 * @returns {string} Stringa formattata 'YYYY-MM-DD' o stringa vuota.
 */
function formatServerDate(val) {
  if (val === undefined || val === null) return "";

  // Caso 1: È già un oggetto Date nativo di Apps Script
  if (val instanceof Date) {
    return !isNaN(val.getTime()) ? Utilities.formatDate(val, CONFIG.TIMEZONE, "yyyy-MM-dd") : "";
  }

  let s = String(val).trim();
  if (s === "" || s === "—" || s === "-") return "";

  // Caso 2: È una stringa ISO o YYYY-MM-DD (es. 2026-07-04T18:30:00.000Z)
  // Isoliamo i componenti via Regex per impedire ai fusi orari del server di scalare i giorni
  let isoMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Caso 3: Stringhe grezze estese (es. "Sat Jul 04 2026 18:30:00 GMT...")
  let d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  return s; // Fallback di sicurezza estremo
}

/**
 * Ottimizzazione delle letture (Bulk Reading): Estrae l'intero contesto di un foglio in un colpo solo.
 * O(1) Network overhead.
 * * @param {string} sheetName - Nome del foglio target.
 * @returns {Object} Oggetto contenente istanza foglio, matrice dati grezzi e array intestazioni.
 */
function getSheetContext(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { sheet: null, data: [], headers: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data.length > 0 ? data[0].map(h => String(h).trim()) : [];
  return { sheet: sheet, data: data, headers: headers };
}

/**
 * Trasforma una matrice piatta di Google Sheets in un array di oggetti JSON JavaScript.
 * Associa dinamicamente le intestazioni del foglio come chiavi dell'oggetto.
 * * @param {Spreadsheet} ss - Istanza del foglio elettronico attivo.
 * @param {string} sheetName - Nome del foglio da convertire.
 * @returns {Array<Object>} Array di record ad oggetti.
 */
function getSheetDataAsObjects(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h).trim());
  const objects = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach((header, index) => {
      let val = row[index];
      // Normalizzazione preventiva delle date in lettura
      if (val instanceof Date) {
        obj[header] = formatServerDate(val);
      } else {
        obj[header] = val !== undefined && val !== null ? val : "";
      }
    });
    objects.push(obj);
  }
  return objects;
}