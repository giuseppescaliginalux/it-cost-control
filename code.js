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
    INITIATIVES: "Initiatives",
    PROJECTIONS: "FiscalProjections"
  }
};

function doGet(e) {
  // 1. SE NON C'È IL TOKEN: L'utente sta aprendo la dashboard dal browser.
  // Restituiamo l'interfaccia grafica (HTML).
  if (!e.parameter.token) {
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('FinOps Executive Dashboard - FY27')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2. CHIAMATA API ESTERNA: Restituiamo il Super-Payload completo
  try {
    if (e.parameter.token !== CONFIG.TOKEN) {
      return jsonResponse({ error: "Access Denied." });
    }

    // Passiamo 'true' per evitare un doppio sanitize (lo fa già jsonResponse)
    const payload = getFullPayload_Internal(true);
    return jsonResponse(payload);

  } catch (error) {
    return jsonResponse({ error: "Error", details: error.toString() });
  }
}

// ==========================================
// 2. LA CENTRALE DATI (CHIAMATA DAL FRONTEND)
// ==========================================

function getFullPayload_Internal(skipSanitize = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Estrae tutti i fogli necessari in un colpo solo
  const fullPayload = {
    assets: getAssetsControlCenter(ss),
    contracts: getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [],
    initiatives: getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [],
    bridge: getSheetDataAsObjects(ss, CONFIG.SHEETS.BRIDGE) || [],
    projections: getSheetDataAsObjects(ss, CONFIG.SHEETS.PROJECTIONS) || []
  };

  // Sanifica le date per il passaggio via google.script.run
  return skipSanitize ? fullPayload : sanitizeForJSON(fullPayload);
}

// Crea la vista "Inventory" unendo Assets e Variances
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

// Funzione necessaria per includere i file modulari (js_core.html, ecc.) dentro index.html
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// 3. UTILS DI SISTEMA
// ==========================================

function getSheetDataAsObjects(ss, name) {
  const s = ss.getSheetByName(name);
  if (!s) return null;
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return []; // Foglio vuoto o solo intestazioni

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
      return value.toISOString(); // Converte le date in stringhe sicure
    }
    return value;
  }));
}

function jsonResponse(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}