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
    const assetFolder = getOrCreateFolder(assetName, getOrCreateFolder(supplier, getOrCreateFolder(year.toString(), rootFolder)));

    return filesData.map(file => {
      const existingFiles = assetFolder.getFilesByName(file.filename);
      if (existingFiles.hasNext()) return existingFiles.next().getUrl();
      return assetFolder.createFile(Utilities.newBlob(Utilities.base64Decode(file.base64), file.mimeType, file.filename)).getUrl();
    });
  } catch (error) { throw new Error("Drive upload error: " + error.toString()); }
}
