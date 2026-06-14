// ==========================================
// 1. CONFIGURAZIONE E ROUTING
// ==========================================
const CONFIG = {
  TOKEN: "FinOps2026_Secure_Token_XYZ",
  SHEETS: {
    ASSETS: "Assets",
    VARIANCE: "AssetVarianceReport",
    BRIDGE: "AssetAllocationBridge",
    CONTRACTS: "Contracts",
    MASTER_CONTRACTS: "MasterContracts",
    INITIATIVES: "Initiatives",
    PROJECTIONS: "FiscalProjections",
    SUPPLIERS: "Suppliers",
    COST_CENTERS: "CostCenters",
    LEGAL_ENTITIES: "LegalEntities",
    LOCATIONS: "Locations"
  }
};

function doGet(e) {
  if (!e.parameter.token) {
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('FinOps Executive Dashboard - FY27')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  try {
    if (e.parameter.token !== CONFIG.TOKEN) {
      return jsonResponse({ error: "Access Denied." });
    }
    const payload = getFullPayload_Internal(true);
    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({ error: "Error", details: error.toString() });
  }
}

// ==========================================
// 2. LA CENTRALE DATI (INTEGRATA CLIENT-SIDE)
// ==========================================
function getFullPayload_Internal(skipSanitize = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const fullPayload = {
    assets: getAssetsControlCenter(ss),
    contracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [],
    masterContracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [],
    initiatives: getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [],
    bridge: getSheetDataAsObjects(ss, CONFIG.SHEETS.BRIDGE) || [],
    projections: getSheetDataAsObjects(ss, CONFIG.SHEETS.PROJECTIONS) || [],
    suppliers: getSheetDataAsObjects(ss, CONFIG.SHEETS.SUPPLIERS) || [],
    costCenters: getSheetDataAsObjects(ss, CONFIG.SHEETS.COST_CENTERS) || [],
    legalEntities: getSheetDataAsObjects(ss, CONFIG.SHEETS.LEGAL_ENTITIES) || [],
    locations: getSheetDataAsObjects(ss, CONFIG.SHEETS.LOCATIONS) || []
  };

  return skipSanitize ? fullPayload : sanitizeForJSON(fullPayload);
}

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

// ==========================================
// 3. ENGINE CRUDS MASTER-DETAIL PER LE TABELLE
// ==========================================
const EDITABLE_MASTER = ["Supplier", "Scope", "Comments"];
const EDITABLE_CONTRACTS = [
  "Group ID", "Target Group ID", "Legal Entity", "BL ID", "Request Code",
  "Location", "Service Owner", "Scope", "Cost Recurrence",
  "Total Commitment", "Expenditure Type", "Cost Center",
  "Start Date", "Contract End Date", "Adjusted End Date",
  "Notice Period (Days)", "Auto-Renewal", "Comments"
];

const MASTER_FIELD_MAP = {
    "Master Contract ID": "masterId",
    "Supplier": "supplier",
    "Scope": "masterScope",
    "Comments": "masterComments"
    // Nota: startDate è gestito a parte nel payload master o non serve? 
    // Se serve, aggiungilo qui: "Start Date": "startDate"
};

const CONTRACT_FIELD_MAP = {
    "Contract ID": "contractId",
    "Group ID": "groupId",
    "Target Group ID": "targetGroupId",
    "Legal Entity": "legalEntity",
    "Location": "location",
    "Service Owner": "serviceOwner",
    "Scope": "scope", // Qui è 'scope', non 'masterScope'!
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
    "Comments": "comments" // Qui è 'comments', non 'masterComments'!
};

/* ==========================================================================
   1. ENTRY POINT (ROUTER)
   ========================================================================== */
function processMasterDetailSync(payload) {
  const masterCtx = getSheetContext(CONFIG.SHEETS.MASTER_CONTRACTS);
  const detailCtx = getSheetContext(CONFIG.SHEETS.CONTRACTS);

  // 1. Delega la sincronizzazione del Master
  syncMasterTable(masterCtx, payload);

  // 2. Delega la sincronizzazione dei Contratti (Dettagli)
  syncDetailTable(detailCtx, payload);

  return "SUCCESS";
}

function syncMasterTable(ctx, payload) {
  const { sheet, data, headers } = ctx;
  const masterIdCol = headers.indexOf("Master Contract ID");
  
  let rowIdx = -1;
  for(let i = 1; i < data.length; i++) {
    if(data[i][masterIdCol].toString().trim() === payload.masterId.toString().trim()) {
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

    // Generiamo l'ID usando il conteggio appena calcolato
    const newMasterId = generateMasterIdFromSequence(payload, nextSequence);

    // Creazione nuova riga
    let newRow = new Array(headers.length).fill("");
    newRow[masterIdCol] = newMasterId;
    payload.masterId = newMasterId; // Aggiorniamo il payload per i dettagli

    sheet.appendRow(newRow);
    updateRowSafe(sheet, sheet.getLastRow(), headers, payload, EDITABLE_MASTER, MASTER_FIELD_MAP);
  }
}

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
      if (value !== undefined && value !== null && value !== "") {
        
        let finalValue = value;
        
        // Formattazione Date
        if (["Start Date", "Contract End Date", "Adjusted End Date"].includes(header)) {
           finalValue = new Date(value);
        }
        
        sheet.getRange(rowIdx, idx + 1).setValue(finalValue);
      }
    }
  });
}

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

function generateContractId(detail, payload, counts) {
    let targetSupplier = (payload.supplier || "GENERIC");
    let sLower = targetSupplier.trim().toLowerCase();
    
    counts[sLower] = (counts[sLower] || 0) + 1;
    let formattedCounter = counts[sLower] < 10 ? "0" + counts[sLower] : counts[sLower].toString();
    
    let cleanSupplier = targetSupplier.replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 5);
    let cleanAsset = (payload.assetName || "ASST").replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 4);
    
    let year = detail.startDate ? detail.startDate.split("-")[0] : "YYYY";
    
    return "CTR-" + cleanSupplier + "-" + cleanAsset + "-" + year + "-" + formattedCounter;
}

function generateMasterId(payload, allMasters) {
    // 1. Contatore: Quanti master ha già questo fornitore?
    const supplierCount = allMasters.filter(m => 
        (m["Supplier"] || "").toString().trim().toLowerCase() === payload.supplier.trim().toLowerCase()
    ).length + 1;
    
    const formattedCounter = supplierCount < 10 ? "0" + supplierCount : supplierCount.toString();

    // 2. Pulizia Supplier (regex replace, uppercase, max 5 char)
    const cleanSupplier = payload.supplier.replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 5);
    
    // 3. Pulizia Asset Name (regex replace, uppercase, max 4 char)
    const cleanAsset = (payload.assetName || "ASST").replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 4);
    
    // 4. Anno (estratto dalla data, se presente nel payload)
    let year = "YYYY";
    if (payload.startDate) { // Assicurati di passare startDate dal frontend
        year = payload.startDate.split("-")[0];
    }

    return "MCT-" + cleanSupplier + "-" + cleanAsset + "-" + year + "-" + formattedCounter;
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

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

function sanitizeForJSON(data) {
  return JSON.parse(JSON.stringify(data, function (key, value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }));
}

function jsonResponse(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Logica di Business per i contratti
 * @param {Object} item - Oggetto con i dati grezzi dal frontend
 * @returns {Object} - Oggetto con i campi calcolati
 */
function calculateContractLogic(item) {
    const d = { ...item }; // Cloniamo per non modificare l'originale

    // 1. DATE HELPERS (Per gestire le date come fa Sheets)
    const parse = (dateStr) => dateStr ? new Date(dateStr) : null;
    const diffDays = (start, end) => {
        if (!start || !end) return 0;
        return Math.round((parse(end) - parse(start)) / (1000 * 60 * 60 * 24)) + 1;
    };

    // 2. LOGICA: End Date (IF(ISBLANK(adj), end, adj))
    d.finalEndDate = (d.adjustedEndDate && d.adjustedEndDate !== "") ? d.adjustedEndDate : d.contractEndDate;

    // 3. LOGICA: Contract Term (Mesi)
    if (d.startDate && d.finalEndDate) {
        const start = parse(d.startDate);
        const end = parse(d.finalEndDate);
        // DATEDIF "M" in Sheets è complesso. Usiamo una approssimazione robusta:
        d.contractTerm = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        // Se il giorno di fine è inferiore al giorno di inizio, sottrai 1 mese
        if (end.getDate() < start.getDate()) d.contractTerm--;
    } else {
        d.contractTerm = 0;
    }

    // 4. LOGICA: Effective Commitment
    const origTermDays = diffDays(d.startDate, d.contractEndDate);
    const actTermDays = diffDays(d.startDate, d.finalEndDate);
    const totComm = parseFloat(d.totalCommitment) || 0;

    if (d.costRecurrence === "One-Shot") {
        d.effectiveCommitment = totComm;
    } else if (d.contractEndDate === d.finalEndDate) {
        d.effectiveCommitment = totComm;
    } else {
        d.effectiveCommitment = parseFloat((totComm * (actTermDays / (origTermDays || 1))).toFixed(2));
    }

    // 5. LOGICA: Annual Value
    if (d.costRecurrence === "One-Shot") {
        d.annualValue = parseFloat(totComm.toFixed(2));
    } else {
        const origTerm = Math.max(1, origTermDays);
        d.annualValue = parseFloat(((totComm / origTerm) * 365).toFixed(2));
    }

    // 6. LOGICA: Status
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = parse(d.startDate);
    const end = parse(d.finalEndDate);

    if (!d.startDate) {
        d.status = "";
    } else if (end < today) {
        d.status = "EXPIRED";
    } else if (start > today) {
        d.status = "UPCOMING";
    } else {
        d.status = "ACTIVE";
    }

    return d;
}