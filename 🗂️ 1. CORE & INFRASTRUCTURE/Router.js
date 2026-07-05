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
      projections: getSheetDataAsObjects(ss, CONFIG.SHEETS.PROJECTIONS) 
    };
    
  } catch (error) {
    console.error("ROUTER ERROR [getFullPayload_Internal]:", error.message);
    throw new Error("Data Retrieval Failure: " + error.message);
  }
}