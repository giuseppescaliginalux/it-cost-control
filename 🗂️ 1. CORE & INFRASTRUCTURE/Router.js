/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: API ROUTER / GATEWAY
 * ============================================================================
 * Gestisce il transito dei dati tra Client (UI) e Server (Domini).
 * Disaccoppia completamente il protocollo di rete dalla logica di business.
 * ============================================================================
 */

/**
 * ============================================================================
 * WEB APP WEB SERVICE ENTRY POINTS (L'INTERFACCIA DI CARICAMENTO UI)
 * ============================================================================
 */

/**
 * CORE ENTRY POINT: Intercetta la richiesta HTTP GET e compila il template index.html.
 * Inietta dinamicamente i fogli di stile e la logica JavaScript isolata.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('IT Cost Control Hub')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * TEMPLATE HELPER: Consente l'inclusione nativa dei file HTML secondari (CSS/JS)
 * all'interno del file principale per aggirare i limiti di struttura di GAS.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ============================================================================
 * API ROUTER / GATEWAY (FUNZIONI DI RETE ESISTENTI)
 * ============================================================================
 */
// ... Il resto del tuo Router.js (processMasterDetailSync, getFullPayload_Internal, ecc.) rimane invariato ...

/**
 * API ENDPOINT: Sincronizzazione ed elaborazione dei contratti da Timeline/Dashboard.
 * @param {Object} payload - DTO contenente Master Contract, Details, Splits e Ledger.
 * @returns {string} Stato dell'operazione ("SUCCESS" o messaggio di errore).
 */
function processMasterDetailSync(payload) {
  try {
    console.log("ROUTER: Ricevuto payload contratti. Delegazione a ContractDomain...");

    // Raccordo verso il futuro ContractService
    return ContractDomain.processAndSync(payload);

  } catch (error) {
    console.error("ROUTER ERROR [processMasterDetailSync]:", error.message);
    throw new Error("Sync Failure: " + error.message);
  }
}

/**
 * API ENDPOINT: Sincronizzazione massiva delle iniziative di ottimizzazione.
 * @param {Array<Object>} payload - Array di oggetti iniziativa inviati dalla UI.
 * @returns {string} Stato dell'operazione.
 */
function processInitiativesSync(payload) {
  try {
    console.log("ROUTER: Ricevuto payload iniziative. Delegazione a InitiativeDomain...");

    // Raccordo verso il futuro InitiativeService
    const result = InitiativeDomain.processAndSync(payload);

    // Discatena il ricalcolo a cascata delle proiezioni per riflettere i cambiamenti
    console.log("ROUTER: Innesco aggiornamento proiezioni post-iniziativa...");
    ProjectionDomain.recalculateAll();

    return result;

  } catch (error) {
    console.error("ROUTER ERROR [processInitiativesSync]:", error.message);
    throw new Error("Initiatives Sync Failure: " + error.message);
  }
}

/**
 * ============================================================================
 * CONTRACTS DOMAIN API ENDPOINTS (Esposte al Client)
 * ============================================================================
 */

/**
 * Ricalcola la logica di business di un contratto (Date, Run Rate, Effective Commitment)
 * passando la palla al Domain Model puro senza sporcare il frontend.
 */
function calculateContractLogic(contractData) {
  try {
    // Sfrutta il costruttore del Dominio per validare e calcolare i campi
    const contract = new Contract(contractData);
    return contract.exportToData();
  } catch (error) {
    console.error("API ERROR [calculateContractLogic]:", error.message);
    throw new Error("Calculation engine error: " + error.message);
  }
}

/**
 * Motore di simulazione del Ledger: Genera le proiezioni mensili in base ai Billing Terms
 */
function apiPreviewLedgerAutoForecast(contractData, currentLedger) {
  try {
    const contract = new Contract(contractData);
    const ledgerMovements = (currentLedger || []).map(l => new LedgerMovement(l));

    // Genera la preview usando il motore matematico del Dominio
    const forecast = contract.generateForecastLedger(ledgerMovements);

    return forecast.map(f => f.exportToData());
  } catch (error) {
    console.error("API ERROR [apiPreviewLedgerAutoForecast]:", error.message);
    throw new Error("Ledger simulation failed: " + error.message);
  }
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
 * API ENDPOINT: Caricamento asincrono iniziale di tutti i dati necessari al client.
 * Ottimizzato in un'unica chiamata bulk per azzerare la latenza di caricamento della UI.
 * @returns {Object} Pacchetto dati aggregato pronto per l'iniezione nel frontend.
 */
function getFullPayload_Internal() { // Allineato al nome chiamato in js_core.html (apiFetchFullPayload)
  try {
    console.log("ROUTER: Richiesta bulk dati iniziali dal client...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    return {
      masterContracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS),
      contracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS),
      initiatives: getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES),
      ledger: getSheetDataAsObjects(ss, CONFIG.SHEETS.LEDGER),
      allocationSplits: getSheetDataAsObjects(ss, CONFIG.SHEETS.ALLOCATION_SPLITS),
      assets: getSheetDataAsObjects(ss, CONFIG.SHEETS.ASSETS),
      varianceReport: getSheetDataAsObjects(ss, CONFIG.SHEETS.VARIANCE),
      projections: getSheetDataAsObjects(ss, CONFIG.SHEETS.PROJECTIONS),
      suppliers: getSheetDataAsObjects(ss, CONFIG.SHEETS.SUPPLIERS),
      locations: getSheetDataAsObjects(ss, CONFIG.SHEETS.LOCATIONS),
      costCenters: getSheetDataAsObjects(ss, CONFIG.SHEETS.COST_CENTERS),
      legalEntities: getSheetDataAsObjects(ss, CONFIG.SHEETS.LEGAL_ENTITIES)
    };

  } catch (error) {
    console.error("ROUTER ERROR [getFullPayload_Internal]:", error.message);
    throw new Error("Data Retrieval Failure: " + error.message);
  }
}
