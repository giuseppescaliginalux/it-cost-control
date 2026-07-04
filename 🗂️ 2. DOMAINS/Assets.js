/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: ASSETS & BUDGETS DOMAIN (PURE OOP)
 * ============================================================================
 * Gestisce l'anagrafe degli Asset, gli stanziamenti di Budget economici
 * e il consolidamento dello stato di salute (Budget Status) rispetto alle proiezioni.
 * ============================================================================
 */

// ============================================================================
// 1. DOMAIN ENTITIES (Oggetti di Dominio Intelligenti)
// ============================================================================

/**
 * @class Asset
 * @description Entità centrale dell'anagrafe. Governa i suoi metadati e il suo Budget.
 */
class Asset {
  constructor(rawData) {
    this.id = rawData["Asset ID"] || rawData.assetId || "";
    this.name = rawData["Asset Name"] || rawData.assetName || "";
    this.manufacturer = rawData["Manufacturer"] || "";
    this.businessDriver = rawData["Business Driver"] || "";
    this.category = rawData["Asset Category"] || "";
    
    // Lo stanziamento di budget registrato sull'anagrafe (es. per l'anno corrente)
    this.budgetFY27 = parseFloat(rawData["Budget FY27"]) || 0; 
    
    this._raw = rawData;
  }

  /**
   * SOLID Behavioral Engine: Calcola lo stato del budget (Sotto, In Linea, Fuori Budget)
   * confrontando lo stanziamento dell'Asset con la proiezione ottimizzata reale.
   * @param {number} optimizedProjectionValue - Il valore calcolato dal ProjectionDomain
   * @returns {string} Lo stato del semaforo finanziario
   */
  evaluateBudgetStatus(optimizedProjectionValue) {
    if (this.budgetFY27 <= 0) return "NO BUDGET DEFINED";
    if (optimizedProjectionValue === 0) return "NO REAL SPEND";

    const variancePct = ((optimizedProjectionValue - this.budgetFY27) / this.budgetFY27) * 100;

    if (variancePct > 5) return "❌ OVER BUDGET (>" + Math.round(variancePct) + "%)";
    if (variancePct < -5) return "🟢 SAVING GENERATED (" + Math.round(variancePct) + "%)";
    return "🟡 IN LINE WITH BUDGET";
  }

  exportToData(optimizedProjectionValue = 0) {
    // Sincronizzazione speculare con il foglio Excel preservando le colonne esistenti
    return {
      ...this._raw,
      "Asset ID": this.id,
      "Asset Name": this.name,
      "Manufacturer": this.manufacturer,
      "Business Driver": this.businessDriver,
      "Budget Status (FY27)": this.evaluateBudgetStatus(optimizedProjectionValue),
      "Run Rate": optimizedProjectionValue // Inietta il costo reale corrente calcolato dalle proiezioni
    };
  }
}

// ============================================================================
// 2. DATA ACCESS LAYER (REPOSITORY)
// ============================================================================

/**
 * @class AssetRepository
 * @description Unico punto di accesso I/O per i fogli Assets e Variance Report.
 */
class AssetRepository {
  constructor() {
    this.sheetName = CONFIG.SHEETS.ASSETS;
  }

  /**
   * Ritorna tutti gli asset censiti come oggetti di dominio.
   */
  findAll() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawData = getSheetDataAsObjects(ss, this.sheetName) || [];
    return rawData.map(r => new Asset(r));
  }

  /**
   * Sovrascrive interamente il foglio degli asset con la matrice aggiornata (Bulk Write).
   * @param {Array<Object>} assetsDataArray 
   */
  saveAll(assetsDataArray) {
    const ctx = getSheetContext(this.sheetName);
    if (!ctx.sheet) throw new Error("Assets sheet infrastructure missing.");

    if (assetsDataArray.length === 0) return;

    // Generiamo la matrice di righe mappando le intestazioni originali per non distruggere il foglio
    const rows = assetsDataArray.map(assetData => {
      return ctx.headers.map(h => {
        let val = assetData[h];
        return val !== undefined && val !== null ? val : "";
      });
    });

    // Scrittura atomica O(1)
    if (ctx.sheet.getLastRow() > 1) {
      ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.sheet.getTemplateRow ? ctx.sheet.getLastColumn() : ctx.headers.length).clearContent();
    }
    ctx.sheet.getRange(2, 1, rows.length, ctx.headers.length).setValues(rows);
    console.log(`ASSET REPOSITORY: Consolidati ${rows.length} asset strutturati.`);
  }
}

// ============================================================================
// 3. BUSINESS LOGIC LAYER (SERVICE)
// ============================================================================

/**
 * @class AssetService
 * @description Orchestratore di dominio che unisce i Budget anagrafici con le Proiezioni fiscali.
 */
class AssetService {
  constructor() {
    this.repository = new AssetRepository();
  }

  /**
   * Interroga il dominio delle Proiezioni, estrae i costi reali ottimizzati per l'anno in corso
   * e consolida il "Budget Status" di ciascun Asset.
   */
  consolidateBudgets() {
    console.log("ASSET SERVICE: Avvio riconciliazione Budget Portafoglio Asset...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Estrae tutti gli asset tramite il proprio repository
    const assets = this.repository.findAll();
    if (assets.length === 0) return;

    // 2. Estrae i dati grezzi dal foglio FiscalProjections (generato precedentemente dal ProjectionDomain)
    const activeProjections = getSheetDataAsObjects(ss, CONFIG.SHEETS.PROJECTIONS) || [];

    const updatedAssetsPayload = assets.map(asset => {
      // 3. Raggruppa e somma tutte le proiezioni "Optimized" di competenza di questo specifico Asset per l'anno target (es. FY27)
      const assetOptimizedSpendFY27 = activeProjections
        .filter(p => 
          String(p["Asset Name"]).trim().toLowerCase() === asset.name.trim().toLowerCase() &&
          String(p["Fiscal Period"]).trim().toUpperCase() === "FY27"
        )
        .reduce((sum, p) => sum + (parseFloat(p["Optimized Value"]) || 0), 0);

      // 4. Chiede all'entità Asset di autovalutarsi e ritorna il DTO pronto per il database
      return asset.exportToData(parseFloat(assetOptimizedSpendFY27.toFixed(2)));
    });

    // 5. Spinge l'intera matrice consolidata al repository per la scrittura bulk
    this.repository.saveAll(updatedAssetsPayload);
    console.log("ASSET SERVICE: Consolidamento Budget Portafoglio completato.");
  }
}

// Global Singleton Export
const AssetDomain = new AssetService();