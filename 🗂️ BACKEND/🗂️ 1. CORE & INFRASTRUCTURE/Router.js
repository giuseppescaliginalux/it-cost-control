/**
 * ============================================================================
 * FINOPS ENTERPRISE: API ROUTER & GATEWAY
 * ============================================================================
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("IT Cost Control Hub")
    .addItem("🧹 Empty Cache", "clearAppCache")
    .addItem("⚡ Run Auto-Forecast", "batchRecalculateEcosystemLedgers")
    .addToUi();
}

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('IT Cost Control Hub')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// ENDPOINTS
// ============================================================================

function getFullPayload_Internal() {
  try {
    console.time("⏱️ TOTALE getFullPayload");

    console.time("1. Check Cache");
    const cachedPayload = FinOpsCache.get("DASHBOARD_PAYLOAD");
    console.timeEnd("1. Check Cache");

    if (cachedPayload) {
      console.log("Servito da Cache!");
      console.timeEnd("⏱️ TOTALE getFullPayload");
      return cachedPayload;
    }

    console.time("2. Build Payload (DB + Mapper)");
    const rawPayload = PayloadBuilder.buildFullPayload();
    console.timeEnd("2. Build Payload (DB + Mapper)");

    console.time("3. Deep Purification (JSON)");
    const cleanPayload = JSON.parse(JSON.stringify(rawPayload));
    console.timeEnd("3. Deep Purification (JSON)");

    console.time("4. Salva in Cache");
    FinOpsCache.put("DASHBOARD_PAYLOAD", cleanPayload);
    console.timeEnd("4. Salva in Cache");

    console.timeEnd("⏱️ TOTALE getFullPayload");
    return cleanPayload;
  } catch (error) {
    throw new Error("Data Retrieval Failure: " + error.message);
  }
}

function processMasterDetailSync(payload) {
  const lock = LockService.getScriptLock();
  try {
    console.time("⏱️ TOTALE Sync");
    lock.waitLock(20000);

    ContractDomain.processAndSync(payload);
    InitiativeDomain.forceRecalculateAll();
    AssetDomain.consolidateBudgets();

    console.time("A. DB Commit (Scrittura)");
    FinOpsDatabase.commit();
    console.timeEnd("A. DB Commit (Scrittura)");

    console.time("B. Payload Rebuild & Purify");
    const responsePayload = PayloadBuilder.buildFullPayload();
    responsePayload.status = "SUCCESS";
    const cleanResponse = JSON.parse(JSON.stringify(responsePayload));
    console.timeEnd("B. Payload Rebuild & Purify");

    FinOpsCache.put("DASHBOARD_PAYLOAD", cleanResponse);

    console.timeEnd("⏱️ TOTALE Sync");
    return cleanResponse;
  } catch (error) {
    throw new Error("Sync Failure: " + error.message);
  } finally { lock.releaseLock(); }
}

function processInitiativesSync(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    InitiativeDomain.processAndSync(payload);
    ContractDomain.forceRecalculateAll();
    AssetDomain.consolidateBudgets();
    FinOpsDatabase.commit();

    const responsePayload = PayloadBuilder.buildFullPayload();
    responsePayload.status = "SUCCESS";
    const cleanResponse = JSON.parse(JSON.stringify(responsePayload));

    FinOpsCache.put("DASHBOARD_PAYLOAD", cleanResponse);
    return cleanResponse;
  } catch (error) {
    throw new Error("Initiatives Sync Failure: " + error.message);
  } finally { lock.releaseLock(); }
}

function processTimelineSync(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    // 1. DELEGAZIONE ARCHITETTURALE: Passiamo il delta al Service (SOLID approach)
    ContractDomain.syncTimelineState(payload.masterContracts || [], payload.contracts || []);

    // 2. Sincronizziamo lo stato degli asset senza piallare il Ledger
    AssetDomain.consolidateBudgets();

    // 3. Eseguiamo il commit fisico
    FinOpsDatabase.commit();

    // 4. RICOSTRUZIONE CACHE
    const responsePayload = PayloadBuilder.buildFullPayload();
    responsePayload.status = "SUCCESS";
    const cleanResponse = JSON.parse(JSON.stringify(responsePayload));

    if (typeof clearAppCache === 'function') clearAppCache();
    else FinOpsCache.clear("DASHBOARD_PAYLOAD");

    return cleanResponse;
  } catch (error) {
    throw new Error("Timeline Sync Failure: " + error.message);
  } finally { lock.releaseLock(); }
}

/**
 * BACKEND ROUTE: Centralino unico per la persistenza di tutto il Master Data Framework.
 * Riceve i DTO in camelCase dal client, delega il mapping alle repository e committa su Sheets.
 */
function processMasterDataEcosystemSync(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // Rete di protezione per scritture concorrenti
    console.log("=== API ROUTER: AVVIO SCRITTURA ATOMICA MASTER DATA SYSTEM ===");

    FinOpsDatabase.preloadAll(); // Allinea la cache in RAM del database
    const budgetRepo = new BudgetRepository();
    const masterDataRepo = new MasterDataRepository();

    // 1. Persistenza dei Domini Finanziari Strutturati (Budget & Bridge)
    if (payload.allocations && Array.isArray(payload.allocations)) budgetRepo.overwriteAllAllocations(payload.allocations);
    if (payload.bridge && Array.isArray(payload.bridge)) budgetRepo.overwriteAllBridges(payload.bridge);

    // 2. Persistenza isolata delle LookUp Tables Anagrafiche Generiche
    if (payload.suppliers) masterDataRepo.overwriteSuppliers(payload.suppliers);
    if (payload.legalEntities) masterDataRepo.overwriteLegalEntities(payload.legalEntities);
    if (payload.costCenters) masterDataRepo.overwriteCostCenters(payload.costCenters);
    if (payload.locations) masterDataRepo.overwriteLocations(payload.locations);
    if (payload.deliveryModels) masterDataRepo.overwriteDeliveryModels(payload.deliveryModels);
    if (payload.optimizationLevers) masterDataRepo.overwriteOptimizationLevers(payload.optimizationLevers);
    if (payload.assetCategories) masterDataRepo.overwriteAssetCategories(payload.assetCategories);
    if (payload.currencyExchangeRates) masterDataRepo.overwriteCurrencyExchangeRates(payload.currencyExchangeRates);

    // 3. Esecuzione del Commit Fisico sul foglio
    FinOpsDatabase.commit();

    if (typeof clearAppCache === 'function') clearAppCache(); // Svuota la cache di boot

    console.log("=== API ROUTER: MASTER DATA ECOSYSTEM SYNCED SUCCESSFULLY ===");
    return { status: "SUCCESS" };
  } catch (error) {
    console.error("Errore nel salvataggio dell'ecosistema anagrafiche:", error);
    throw new Error("Master Data Sync Failure: " + error.message);
  } finally {
    lock.releaseLock(); // Rilascia sempre il semaforo di sicurezza
  }
}

// ============================================================================
// UTILITIES ESPOSTE
// ============================================================================

function apiGetLiveDriveFileNames(urlsString) {
  if (!urlsString || urlsString.trim() === "") return [];
  return urlsString.split(',').map(s => s.trim()).filter(s => s).map(rawUrl => {
    let pureUrl = rawUrl.includes('||') ? rawUrl.split('||')[1].trim() : rawUrl;
    let resolvedName = "Attached Document";
    try {
      if (pureUrl.includes("drive.google.com")) {
        let fileId = pureUrl.includes("/d/") ? pureUrl.split("/d/")[1].split("/")[0] : (pureUrl.includes("id=") ? pureUrl.split("id=")[1].split("&")[0] : "");
        if (fileId) resolvedName = DriveApp.getFileById(fileId).getName();
      } else {
        let filename = new URL(pureUrl).pathname.split('/').pop();
        resolvedName = filename ? decodeURIComponent(filename) : "External Link";
      }
    } catch (e) { resolvedName = "Accessible Attachment"; }
    return { raw: rawUrl, url: pureUrl, name: resolvedName };
  });
}

function getOrCreateFolder(folderName, parentFolder) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function uploadFilesToDrive(filesData, year, supplier, assetName) {
  try {
    const rootItr = DriveApp.getFoldersByName("IT Cost Center");
    const rootFolder = rootItr.hasNext() ? rootItr.next() : DriveApp.createFolder("IT Cost Center");
    // NUOVO STEP: Creiamo o recuperiamo la sottocartella "Contracts"
    const contractsFolder = getOrCreateFolder("Contracts", rootFolder);

    // Aggiorniamo la catena facendola partire da contractsFolder invece che da rootFolder
    const assetFolder = getOrCreateFolder(assetName, getOrCreateFolder(supplier, getOrCreateFolder(year.toString(), contractsFolder)));

    return filesData.map(file => {
      const existingFiles = assetFolder.getFilesByName(file.filename);
      if (existingFiles.hasNext()) return existingFiles.next().getUrl();
      return assetFolder.createFile(Utilities.newBlob(Utilities.base64Decode(file.base64), file.mimeType, file.filename)).getUrl();
    });
  } catch (error) { throw new Error("Drive upload error: " + error.toString()); }
}
