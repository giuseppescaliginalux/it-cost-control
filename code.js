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
function saveMasterDetailContract(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_CONTRACTS);
  const detailSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS);
  const masterId = payload.masterId;

  // 1. Scrittura Dinamica e selettiva su MasterContracts
  const mHeaders = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const mData = masterSheet.getDataRange().getValues();
  let mRowIdx = -1;
  for (let i = 1; i < mData.length; i++) {
    if (mData[i][0].toString().trim() === masterId.toString().trim()) {
      mRowIdx = i + 1; break;
    }
  }

  let mRow = mRowIdx > -1 ? mData[mRowIdx - 1] : new Array(mHeaders.length).fill("");
  mHeaders.forEach((header, idx) => {
    if (header === "Master Contract ID") mRow[idx] = masterId;
    else if (header === "Asset Name") mRow[idx] = payload.assetName;
    else if (header === "Asset ID") mRow[idx] = payload.assetId;
    else if (header === "Supplier") mRow[idx] = payload.supplier;
    else if (header === "Scope") mRow[idx] = payload.masterScope;
    else if (header === "Comments") mRow[idx] = payload.masterComments;
    else if (mRowIdx === -1) { mRow[idx] = ""; } 
  });

  if (mRowIdx > -1) {
    masterSheet.getRange(mRowIdx, 1, 1, mHeaders.length).setValues([mRow]);
  } else {
    masterSheet.appendRow(mRow);
  }

  // 2. Rimozione a cascata (Cascading Delete) su Contracts
  const dData = detailSheet.getDataRange().getValues();
  for (let j = dData.length - 1; j >= 1; j--) {
    if (dData[j][1].toString().trim() === masterId.toString().trim()) {
      detailSheet.deleteRow(j + 1);
    }
  }

  if (payload.details.length === 0) return "SUCCESS";

  // 3. Iniezione controllata dei dettagli manuali in Contracts
  const dHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  
  payload.details.forEach(detail => {
    let newRow = new Array(dHeaders.length).fill("");
    dHeaders.forEach((header, idx) => {
      if (header === "Master Contract ID") newRow[idx] = masterId;
      else if (header === "Group ID") newRow[idx] = detail.groupId;
      else if (header === "Target Group ID") newRow[idx] = detail.targetGroupId;
      else if (header === "Legal Entity") newRow[idx] = detail.legalEntity;
      else if (header === "BL ID") newRow[idx] = detail.blId;
      else if (header === "Request Code") newRow[idx] = detail.requestCode;
      else if (header === "Location") newRow[idx] = detail.location;
      else if (header === "Service Owner") newRow[idx] = detail.serviceOwner;
      else if (header === "Scope") newRow[idx] = detail.scope;
      else if (header === "Start Date") newRow[idx] = detail.startDate;
      else if (header === "Contract End Date") newRow[idx] = detail.contractEndDate;
      else if (header === "Adjusted End Date") newRow[idx] = detail.adjustedEndDate;
      else if (header === "Notice Period (Days)") newRow[idx] = detail.noticePeriod ? parseInt(detail.noticePeriod) : "";
      else if (header === "Auto-Renewal") newRow[idx] = detail.autoRenewal;
      else if (header === "Cost Recurrence") newRow[idx] = detail.costRecurrence;
      else if (header === "Total Commitment") newRow[idx] = parseFloat(detail.totalCommitment) || 0;
      else if (header === "Expenditure Type") newRow[idx] = detail.expenditureType;
      else if (header === "Cost Center") newRow[idx] = detail.costCenter;
      else if (header === "Comments") newRow[idx] = detail.comments;
      else { newRow[idx] = ""; } 
    });
    detailSheet.appendRow(newRow);
  });

  return "SUCCESS";
}

function deleteMasterDetailContract(masterId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_CONTRACTS);
  const detailSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS);
  
  const masterData = masterSheet.getDataRange().getValues();
  for (let i = masterData.length - 1; i >= 1; i--) {
    if (masterData[i][0].toString().trim() === masterId.toString().trim()) masterSheet.deleteRow(i + 1);
  }
  
  const detailData = detailSheet.getDataRange().getValues();
  for (let j = detailData.length - 1; j >= 1; j--) {
    if (detailData[j][1].toString().trim() === masterId.toString().trim()) detailSheet.deleteRow(j + 1);
  }
  return "DELETED";
}

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