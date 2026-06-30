const EDITABLE_MASTER = ["Asset Name", "Supplier", "Scope", "Comments", "Status", "Master Start Date", "Master End Date",
  "Contract Term (Months)", "Total Commitment", "Run Rate", "Billing Channel", "Contract Links"];

const EDITABLE_CONTRACTS = [
  "Asset Name", "Supplier", "Group ID", "Target Group ID", "Legal Entity", "BL ID", "Request Code",
  "Location", "Service Owner", "Scope", "Cost Recurrence",
  "Total Commitment", "Expenditure Type", "Cost Center",
  "Start Date", "Contract End Date", "Adjusted End Date",
  "Notice Period (Days)", "Auto-Renewal", "Comments",
  "Status", "Annual Value", "Effective Commitment", "Contract Term (Months)", "End Date",
  "Billing Terms", "Pricing Model", "Contract Links"
];

const MASTER_FIELD_MAP = {
  "Master Contract ID": "masterId",
  "Asset Name": "assetName",
  "Supplier": "supplier",
  "Scope": "masterScope",
  "Comments": "masterComments",
  "Status": "status",
  "Master Start Date": "masterStartDate",
  "Master End Date": "masterEndDate",
  "Contract Term (Months)": "contractTerm",
  "Total Commitment": "totalCommitment",
  "Run Rate": "runRate",
  "Billing Channel": "billingChannel",
  "Contract Links": "contractLinks"
};

const CONTRACT_FIELD_MAP = {
  "Contract ID": "contractId",
  "Asset Name": "assetName",
  "Supplier": "supplier",
  "Billing Channel": "billingChannel",
  "Group ID": "groupId",
  "Target Group ID": "targetGroupId",
  "Legal Entity": "legalEntity",
  "Location": "location",
  "Service Owner": "serviceOwner",
  "Scope": "scope",
  "Cost Recurrence": "costRecurrence",
  "Total Commitment": "totalCommitment",
  "Expenditure Type": "expenditureType",
  "Cost Center": "costCenter",
  "Start Date": "startDate",
  "Contract End Date": "contractEndDate",
  "Adjusted End Date": "adjustedEndDate",
  "Notice Period (Days)": "noticePeriod",
  "Auto-Renewal": "autoRenewal",
  "BL ID": "blId",
  "Request Code": "requestCode",
  "Comments": "comments",
  "Status": "status",
  "Annual Value": "annualValue",
  "Effective Commitment": "effectiveCommitment",
  "Contract Term (Months)": "contractTerm",
  "End Date": "endDate",
  "Billing Terms": "billingTerms",
  "Pricing Model": "pricingModel",
  "Contract Links": "contractLinks"
};

/**
 * Recupera il contesto del foglio (sheet, dati, header).
 * @param {string} sheetName - Nome del foglio da aprire.
 * @returns {Object} - Oggetto contenente lo sheet, i dati e gli header.
 */
function getSheetContext(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim());

  return {
    sheet: sheet,
    data: data,
    headers: headers
  };
}

/**
 * Gestisce la sincronizzazione della tabella Master.
 * Determina se aggiornare un record esistente o crearne uno nuovo.
 */
function syncMasterTable(ctx, payload) {
  const { sheet, data, headers } = ctx;
  const masterIdCol = headers.indexOf("Master Contract ID");

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][masterIdCol].toString().trim() === payload.masterId.toString().trim()) {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx > 0) {
    console.log("MASTER: Aggiorno riga " + rowIdx);
    console.log(JSON.stringify(payload, null, 2));
    // Aggiornamento sicuro
    updateRowSafe(sheet, rowIdx, headers, payload, EDITABLE_MASTER, MASTER_FIELD_MAP);
  } else {
    console.log("MASTER: Creo nuovo record.");

    // CORREZIONE BUG C: Verifica se l'ID è stato digitato a mano o se va auto-generato
    let finalMasterId = payload.masterId ? payload.masterId.toString().trim() : "";

    if (finalMasterId === "") {
      // Carichiamo al volo i master esistenti per calcolare la sequenza corretta
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const allMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
      // Richiamo della tua funzione nativa in logic.gs
      finalMasterId = generateMasterId(payload, allMasters);
    }

    // Creazione nuova riga con l'ID definitivo
    let newRow = new Array(headers.length).fill("");
    newRow[masterIdCol] = finalMasterId;
    payload.masterId = finalMasterId; // Aggiorna il payload per referenza (così i dettagli prendono l'ID corretto!)

    sheet.appendRow(newRow);
    updateRowSafe(sheet, sheet.getLastRow(), headers, payload, EDITABLE_MASTER, MASTER_FIELD_MAP);
  }
}

/**
 * Gestisce la sincronizzazione dei contratti di dettaglio.
 * Confronta i dati in memoria con quelli sul foglio per decidere Update, Insert o Delete.
 */
function syncDetailTable(ctx, payload) {
  const { sheet, data, headers } = ctx;
  const masterIdCol = headers.indexOf("Master Contract ID");
  const contractIdCol = headers.indexOf("Contract ID");
  const supplierCol = headers.indexOf("Supplier");

  // Calcolo contatori globali per la sequenzialità (One-shot)
  const supplierGlobalCounts = {};
  for (let i = 1; i < data.length; i++) {
    let s = (data[i][supplierCol] || "GENERIC").toString().trim().toLowerCase();
    supplierGlobalCounts[s] = (supplierGlobalCounts[s] || 0) + 1;
  }

  // Mappa dei contratti esistenti per questo Master
  const dbMap = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][masterIdCol] == payload.masterId) {
      dbMap.set(data[i][contractIdCol].toString(), i + 1);
    }
  }

  // Confronto: Update o Insert
  payload.details.forEach(detail => {
    // SE L'ID MANCA, LO GENERIAMO QUI
    if (!detail.contractId || detail.contractId.trim() === "") {
      detail.contractId = generateContractId(detail, payload, supplierGlobalCounts);
      console.log("ID GENERATO: " + detail.contractId);
    }
    const cid = detail.contractId.toString();
    if (dbMap.has(cid)) {
      console.log("UPDATE: Aggiorno contratto ID " + cid + " alla riga " + dbMap.get(cid));
      updateRowSafe(sheet, dbMap.get(cid), headers, detail, EDITABLE_CONTRACTS, CONTRACT_FIELD_MAP);
      dbMap.delete(cid);
    } else {
      console.log("INSERT: Aggiungo nuovo contratto ID " + cid);
      appendNewContractRow(sheet, headers, detail, payload.masterId);
    }
  });

  // DELETE: Ciò che resta nella dbMap non era nel payload -> va cancellato
  const rowsToDelete = Array.from(dbMap.values()).sort((a, b) => b - a);
  rowsToDelete.forEach(rowIdx => sheet.deleteRow(rowIdx));
}

/**
 * Aggiunge una nuova riga per un contratto.
 */
function appendNewContractRow(sheet, headers, data, masterId) {
  let newRow = new Array(headers.length).fill("");
  // Inseriamo le chiavi di default
  const masterIdIdx = headers.indexOf("Master Contract ID");
  const contractIdIdx = headers.indexOf("Contract ID");

  if (masterIdIdx > -1) newRow[masterIdIdx] = masterId;
  if (contractIdIdx > -1) newRow[contractIdIdx] = data.contractId;

  sheet.appendRow(newRow);
  // Popoliamo il resto con l'update safe
  updateRowSafe(sheet, sheet.getLastRow(), headers, data, EDITABLE_CONTRACTS, CONTRACT_FIELD_MAP);
}

/**
 * Scrive in una riga specifica in modo sicuro, senza sovrascrivere formule preesistenti 
 * se il campo inviato è vuoto.
 * @param {Object} sheet - L'oggetto foglio di Google.
 * @param {number} rowIdx - Indice della riga da aggiornare.
 * @param {Array} headers - Intestazioni delle colonne.
 * @param {Object} detailData - Dati inviati dal client.
 * @param {Array} editableFields - Lista dei nomi delle colonne editabili.
 * @param {Object} fieldMap - Dizionario di traduzione chiavi (Client -> Foglio).
 */
function updateRowSafe(sheet, rowIdx, headers, detailData, editableFields, fieldMap) {
  headers.forEach((header, idx) => {
    // 1. Controlliamo se la colonna è editabile
    if (editableFields.includes(header)) {

      // 2. Troviamo la chiave corrispondente nel dizionario
      const frontendKey = fieldMap[header];
      const value = detailData[frontendKey];

      // LOG DI DEBUG - QUESTO TI DIRÀ TUTTO
      console.log("Controllo colonna: " + header + " | Chiave attesa: " + frontendKey + " | Valore trovato: " + value);

      // 3. BLINDATURA: Scriviamo solo se il valore ESISTE ed è pieno.
      // Se il payload invia undefined, null o "" (vuoto), la funzione ignora la cella.
      // Così le formule (es. MAP/ARRAYFORMULA) restano intatte!
      if (value !== undefined && value !== null) {

        let finalValue = value;

        // Formattazione Date senza inserire ore e minuti
        if (["Start Date", "Contract End Date", "Adjusted End Date", "End Date", "Master Start Date", "Master End Date"].includes(header)) {
          if (value instanceof Date) {
            finalValue = !isNaN(value.getTime()) ? Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
          } else {
            finalValue = value; // Passa direttamente la stringa "yyyy-MM-dd" pulita
          }
        }

        sheet.getRange(rowIdx, idx + 1).setValue(finalValue);
      }
    }
  });
}

/**
 * Aggrega i dati degli Asset con le informazioni di Varianza.
 * Esegue un merge in memoria tra il foglio 'Assets' e 'AssetVarianceReport' 
 * basandosi sul nome dell'asset.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - L'istanza dello spreadsheet attivo.
 * @returns {Array} - Array di oggetti Asset arricchiti con Budget e Proiezioni.
 */
function getAssetsControlCenter(ss) {
  const assets = getSheetDataAsObjects(ss, CONFIG.SHEETS.ASSETS) || [];
  const variances = getSheetDataAsObjects(ss, CONFIG.SHEETS.VARIANCE) || [];

  const vMap = new Map();
  variances.forEach(v => {
    const assetName = (v["Asset Name"] || "").toString().trim().toLowerCase();
    vMap.set(assetName, { b: v["Effective Budget"], o: v["Fiscal Projection"] });
  });

  return assets.map(a => {
    const name = (a["Asset Name"] || "").toString().trim().toLowerCase();
    const f = vMap.get(name) || { b: 0, o: 0 };
    return { ...a, "Effective Budget": f.b, "Fiscal Projection": f.o };
  });
}

/**
 * Helper per leggere il foglio come array di oggetti (utile per calcoli in memoria).
 */
function getSheetDataAsObjects(ss, name) {
  const s = ss.getSheetByName(name);
  if (!s) return null;
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];

  const h = d[0].map(c => c.toString().trim());
  return d.slice(1).map(r => {
    let o = {};
    h.forEach((header, i) => o[header] = r[i]);
    return o;
  });
}

/**
 * Sincronizza gli Allocation Splits sul foglio Google Sheets.
 * @param {Object} payload - Il payload globale già processato.
 */
function syncAllocationSplits(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ALLOCATION_SPLITS);
  if (!sheet) return;

  const contractIds = payload.details.map(d => d.contractId).filter(id => id);
  if (contractIds.length === 0) return;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const contractIdIdx = headers.indexOf("Contract ID");

  // 1. Pulisce i vecchi split per i contratti coinvolti
  for (let i = data.length - 1; i >= 1; i--) {
    if (contractIds.includes(data[i][contractIdIdx].toString().trim())) {
      sheet.deleteRow(i + 1);
    }
  }

  // 2. Raccoglie tutti i nuovi split
  const allSplits = [];
  payload.details.forEach(detail => {
    if (detail.splits && detail.splits.length > 0) {
      detail.splits.forEach(s => {
        s["Contract ID"] = detail.contractId;
        allSplits.push(s);
      });
    }
  });

  if (allSplits.length === 0) return;

  // 3. Scrive le nuove righe forzando il formato stringa YYYY-MM-DD per le date
  const rowsToAdd = allSplits.map(split => {
    const splitId = "SPL-" + Utilities.getUuid().substring(0, 8).toUpperCase();

    // ESTRAZIONE SICURA DELLA STRINGA DATA SENZA ORARIO
    const validFromStr = split["Valid From"] ? split["Valid From"].toString().split('T')[0] : "";
    const validToStr = split["Valid To"] ? split["Valid To"].toString().split('T')[0] : "";

    return [
      splitId,
      split["Contract ID"] || "",
      split["Target Legal Entity"] || "",
      split["Target Cost Center"] || "",
      split["Allocation Rule"] || "Percentage",
      split["Percentage Share"] !== "" ? (parseFloat(split["Percentage Share"]) / 100) : "",
      split["Fixed Amount"] || "",
      split["Units Assigned"] || "",
      validFromStr, // <-- Scrittura come stringa pura: impedisce ore/minuti e salti di giorno
      validToStr,   // <-- Scrittura come stringa pura
      split["Notes"] || ""
    ];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
}

/**
 * Sincronizza TUTTI i movimenti del Ledger (ACTUAL, FORECAST, CALCULATED)
 * salvando esattamente ciò che è presente nell'interfaccia utente (WYSIWYG).
 */
function syncLedgerMovements(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.LEDGER);
  if (!sheet) return;

  const contractIds = payload.details.map(d => d.contractId).filter(id => id);
  if (contractIds.length === 0) return;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const contractIdIdx = headers.indexOf("Contract ID");

  // 1. WIPE TOTALE: Pulisce tutti i record (qualunque sia il Type) per i contratti coinvolti
  for (let i = data.length - 1; i >= 1; i--) {
    const cId = data[i][contractIdIdx].toString().trim();
    if (contractIds.includes(cId)) {
      sheet.deleteRow(i + 1);
    }
  }

  // 2. RACCOLTA FEDELE: Raccoglie tutto ciò che era nell'interfaccia
  const allLedger = [];
  payload.details.forEach(detail => {
    if (detail.ledger && detail.ledger.length > 0) {
      detail.ledger.forEach(l => {
        l["Contract ID"] = detail.contractId;
        allLedger.push(l); // Non filtriamo il Type: se è nell'UI, lo salviamo
      });
    }
  });

  if (allLedger.length === 0) return;

  // 3. SCRITTURA DIRETTA su Google Sheets
  const rowsToAdd = allLedger.map(mov => {
    const startStr = mov["Start Date"] ? mov["Start Date"].toString().split('T')[0] : "";
    const endStr = mov["End Date"] ? mov["End Date"].toString().split('T')[0] : "";

    return [
      mov["Contract ID"] || "",
      startStr,
      endStr,
      mov["Type"] || "ACTUAL",
      mov["Amount"] || 0,
      mov["Notes"] || ""
    ];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
}