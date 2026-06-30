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
    LEDGER: "Ledger",
    ALLOCATION_SPLITS: "AllocationSplits",
    INITIATIVES: "Initiatives",
    PROJECTIONS: "FiscalProjections",
    SUPPLIERS: "Suppliers",
    COST_CENTERS: "CostCenters",
    LEGAL_ENTITIES: "LegalEntities",
    LOCATIONS: "Locations"
  }
};

/**
 * Entry point principale per la Web App. 
 * Se chiamato via browser, serve l'HTML. Se chiamato via API (token), restituisce i dati.
 */
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

/**
 * Funzione interna per aggregare tutti i dati del Ledger in un unico oggetto.
 * @param {boolean} [skipSanitize=false] - Se true, salta la sanitizzazione JSON.
 * @returns {Object} - Payload completo per il frontend.
 */
function getFullPayload_Internal(skipSanitize = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const fullPayload = {
    assets: getAssetsControlCenter(ss),
    contracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [],
    masterContracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [],
    allocationSplits: getSheetDataAsObjects(ss, CONFIG.SHEETS.ALLOCATION_SPLITS) || [],
    ledger: getSheetDataAsObjects(ss, CONFIG.SHEETS.LEDGER) || [],
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
 * Orchestratore principale che riceve il payload dal client.
 * Delega le operazioni ai moduli di Business Logic e Data Access.
 * @param {Object} payload - Il pacchetto dati completo inviato dal client.
 */
function processMasterDetailSync(payload) {
  const masterCtx = getSheetContext(CONFIG.SHEETS.MASTER_CONTRACTS);
  const detailCtx = getSheetContext(CONFIG.SHEETS.CONTRACTS);

  // 1. BUSINESS LOGIC (logic.js)
  const calculatedPayload = calculateMasterMetricsInMemory(payload);

  // 2. DATA ACCESS: Master e Detail (data.js)
  syncMasterTable(masterCtx, calculatedPayload);
  syncDetailTable(detailCtx, calculatedPayload);

  // 3. DATA ACCESS: Sub-tabelle relazionali (data.js)
  syncAllocationSplits(calculatedPayload);
  syncLedgerMovements(calculatedPayload);

  return "SUCCESS";
}


/**
 * Inserisce il contenuto di un file (HTML/CSS/JS) all'interno di un template.
 * Fondamentale per il rendering dei moduli nel file index.html.
 * @param {string} filename - Nome del file da includere (es. 'css', 'js_core').
 * @returns {string} - Il contenuto testuale del file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Sanitizza i dati prima di inviarli al frontend tramite JSON.
 * Google Apps Script può avere problemi con oggetti complessi come 'Date' quando passati via JSON;
 * questa funzione forza la conversione in stringhe ISO.
 * @param {Object} data - L'oggetto complesso da inviare al client.
 * @returns {Object} - L'oggetto pulito e serializzabile in JSON.
 */
function sanitizeForJSON(data) {
  return JSON.parse(JSON.stringify(data, function (key, value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }));
}

/**
 * Helper per creare risposte JSON standardizzate.
 */
function jsonResponse(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper per trovare o creare una cartella all'interno di un'altra.
 */
function getOrCreateFolder(folderName, parentFolder) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

/**
 * Receives base64 files from frontend and saves them in the correct structure.
 * Prevents duplicates by checking filename existence.
 */
function uploadFilesToDrive(filesData, year, supplier, assetName) {
  try {
    const rootItr = DriveApp.getFoldersByName("IT Cost Center");
    const rootFolder = rootItr.hasNext() ? rootItr.next() : DriveApp.createFolder("IT Cost Center");

    const contractsFolder = getOrCreateFolder("Contracts", rootFolder);
    const yearFolder = getOrCreateFolder(year.toString(), contractsFolder);
    const supplierFolder = getOrCreateFolder(supplier, yearFolder);
    const assetFolder = getOrCreateFolder(assetName, supplierFolder);

    const uploadedUrls = [];

    filesData.forEach(file => {
      const existingFiles = assetFolder.getFilesByName(file.filename);
      if (existingFiles.hasNext()) {
        // File already exists: get its URL instead of creating a duplicate
        const existingFile = existingFiles.next();
        uploadedUrls.push(existingFile.getUrl());
      } else {
        // New file: create it
        const blob = Utilities.newBlob(Utilities.base64Decode(file.base64), file.mimeType, file.filename);
        const newFile = assetFolder.createFile(blob);
        uploadedUrls.push(newFile.getUrl());
      }
    });

    return uploadedUrls;
  } catch (error) {
    throw new Error("Error during Drive upload: " + error.toString());
  }
}

/**
 * API ENDPOINT: Esegue l'anteprima del Ledger in memoria senza toccare il database
 */
function apiPreviewLedgerAutoForecast(contractData, ledgerData) {
  return _lePreviewLedgerAutoForecast(contractData, ledgerData);
}

/**
 * API ENDPOINT: Resolves real-time live names of Google Drive files directly from their URLs.
 * This guarantees that manually renamed files on Drive are dynamically tracked.
 */
function apiGetLiveDriveFileNames(urlsString) {
  if (!urlsString || urlsString.trim() === "") return [];
  const urls = urlsString.split(',').map(s => s.trim()).filter(s => s);
  
  return urls.map(rawUrl => {
    // Backward compatibility: strip old 'Name||' prefix if it exists
    let pureUrl = rawUrl.includes('||') ? rawUrl.split('||')[1].trim() : rawUrl;
    let resolvedName = "Attached Document";
    
    try {
      if (pureUrl.includes("drive.google.com")) {
        let fileId = "";
        if (pureUrl.includes("/d/")) {
          fileId = pureUrl.split("/d/")[1].split("/")[0];
        } else if (pureUrl.includes("id=")) {
          fileId = pureUrl.split("id=")[1].split("&")[0];
        }
        
        if (fileId) {
          // Live fetch from Google Drive core servers
          resolvedName = DriveApp.getFileById(fileId).getName();
        }
      } else {
        // Fallback for standard external web links
        let filename = new URL(pureUrl).pathname.split('/').pop();
        resolvedName = filename ? decodeURIComponent(filename) : "External Link";
      }
    } catch (e) {
      console.error("Failed real-time Drive sync for URL: " + pureUrl, e);
      resolvedName = "Accessible Attachment"; // Fallback if file is deleted or unshared
    }
    
    return {
      raw: rawUrl,
      url: pureUrl,
      name: resolvedName
    };
  });
}