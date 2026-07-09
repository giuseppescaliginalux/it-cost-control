/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: ASSETS & BUDGETS DOMAIN (PURE DTO PATTERN)
 * ============================================================================
 * Gestisce l'anagrafe degli Asset tecnologici, l'analisi dei driver di business
 * e la riconciliazione automatica degli indicatori finanziari (Varianze e Status).
 * ============================================================================
 */

// ============================================================================
// 1. INFRASTRUCTURE & PERSISTENCE SCHEMA (Alta Coesione Locale)
// ============================================================================

const ASSET_FIELD_MAP = {
  "Asset ID": "id",
  "Asset Name": "name",
  "Manufacturer": "manufacturer",
  "Business Driver": "businessDriver",
  "Asset Category": "category",
  "Asset Type": "assetType",
  "Description": "description",
  "Budget Status (FY27)": "budgetStatusFY27",
  "Run Rate": "runRate",
  "Current Status": "currentStatus",
  "Target Status": "targetStatus",
  "Cost Improvement": "costImprovement",
  "Exit Date": "exitDate",
  "Transfer Date": "transferDate",
  "Initiative Target Date": "initiativeTargetDate",
  "Last End Date": "lastEndDate"
};

/**
 * @object AssetMapper
 * @description Isola il Modello di Dominio dalle strutture fisiche delle righe di Google Sheets.
 */
const AssetMapper = {
  /**
   * Trasforma una riga grezza letta dal foglio in un DTO standardizzato in camelCase.
   * Garantisce l'invarianza e la protezione totale da perdita dati per le colonne extra.
   */
  toDto: (rawRow) => {
    const dto = {};
    const mappedKeys = Object.keys(ASSET_FIELD_MAP);
    const mappedCamelKeys = Object.values(ASSET_FIELD_MAP);
    
    // Rete di sicurezza: le colonne custom non censite passano intatte nel DTO
    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
        dto[key] = rawRow[key];
      }
    }
    
    // Traduzione esplicita delle colonne strutturate
    for (let sheetHeader in ASSET_FIELD_MAP) {
      const camelProp = ASSET_FIELD_MAP[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }
    
    return dto;
  }
};

// ============================================================================
// 2. PURE MODEL DOMAIN ENTITY (SOLID: Single Responsibility Principle)
// ============================================================================

/**
 * @class Asset
 * @description Entità di puro dominio. Interagisce unicamente con proprietà camelCase.
 */
class Asset {
  constructor(dto = {}) {
    this.id = dto.id || "";
    this.name = dto.name || "";
    this.manufacturer = dto.manufacturer || "";
    this.businessDriver = dto.businessDriver || "";
    this.category = dto.category || "";
    this.assetType = dto.assetType || "";
    this.description = dto.description || "";
    
    // Stati e metriche finanziarie fluide calcolate in RAM
    this.budgetStatusFY27 = dto.budgetStatusFY27 || "Not Budgeted";
    this.runRate = parseFloat(dto.runRate) || 0;
    this.currentStatus = dto.currentStatus || "RUNNING";
    this.targetStatus = dto.targetStatus || "RETAIN";
    this.costImprovement = parseFloat(dto.costImprovement) || 0;
    this.exitDate = dto.exitDate || "";
    this.transferDate = dto.transferDate || "";
    this.initiativeTargetDate = dto.initiativeTargetDate || "";
    this.lastEndDate = dto.lastEndDate || "";
    
    // Buffer isolato per l'invarianza del Bulk Round-Trip
    this.extraProperties = {};
    const knownProperties = Object.values(ASSET_FIELD_MAP);
    for (let key in dto) {
      if (!knownProperties.includes(key)) {
        this.extraProperties[key] = dto[key];
      }
    }
  }

  /**
   * @description Modulo logico relazionale puro. Esegue l'orchestrazione dei calcoli in RAM
   * basandosi esclusivamente su DTO digeriti e normalizzati provenienti dagli altri domini.
   */
  injectContext(assetProjections, assetContracts, assetInits, assetVariances) {
    // RUN RATE e BUDGET STATUS non sono più calcolati qui, ma dal Frontend a Latenza Zero.
    
    // B: LAST END DATE (Estrazione della massima scadenza contrattuale)
    let maxEndDate = null;
    assetContracts.forEach(c => {
      const dEnd = c.adjustedEndDate ? new Date(c.adjustedEndDate) : (c.contractEndDate ? new Date(c.contractEndDate) : null);
      if (dEnd && !isNaN(dEnd.getTime()) && (!maxEndDate || dEnd > maxEndDate)) {
        maxEndDate = dEnd;
      }
    });
    this.lastEndDate = maxEndDate ? formatServerDate(maxEndDate) : "";

    // C: FINANCIAL INITIATIVES (Ciclo di vita dismissioni/ottimizzazioni)
    let costImprovementSum = 0;
    let strategy = "RETAIN";
    let exitDateStr = ""; let transferDateStr = ""; let initTargetDateStr = "";
    let hasTerminate = false; let hasTransfer = false; let hasOptimize = false;

    assetInits.forEach(init => {
      const initStatus = String(init.status || "").toUpperCase();
      const decision = String(init.decision || "").toUpperCase();

      if (["COMPLETED", "IN PROGRESS"].includes(initStatus)) {
        costImprovementSum += parseFloat(init.actualSavingAnnualized || init.targetSavingAnnualized || 0);
        
        if (init.targetDate) {
          const dTarget = new Date(init.targetDate);
          if (!isNaN(dTarget.getTime())) initTargetDateStr = formatServerDate(dTarget);
        }

        if (["TERMINATE", "REPLACE"].includes(decision)) {
          hasTerminate = true; strategy = "EXIT";
          const dEff = init.actualDate || init.targetDate;
          if (dEff) {
            const d = new Date(dEff);
            if (!isNaN(d.getTime())) exitDateStr = formatServerDate(d);
          }
        } else if (decision === "TRANSFER") {
          hasTransfer = true; strategy = "HANDOVER";
          const dEff = init.actualDate || init.targetDate;
          if (dEff) {
            const d = new Date(dEff);
            if (!isNaN(d.getTime())) transferDateStr = formatServerDate(d);
          }
        } else if (["OPTIMIZATION", "OPTIMIZE"].includes(decision)) {
          hasOptimize = true;
        }
      }
    });

    this.costImprovement = parseFloat(costImprovementSum.toFixed(2));
    this.targetStatus = strategy;
    this.exitDate = exitDateStr;
    this.transferDate = transferDateStr;
    this.initiativeTargetDate = initTargetDateStr;

    // D: MACCHINA A STATI FINITI
    let computedStatus = "RUNNING";
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (hasTransfer) computedStatus = "TRANSFERRED";
    else if (hasTerminate) computedStatus = (exitDateStr && new Date(exitDateStr) <= today) ? "DISMISSED" : "EXITING";
    else if (hasOptimize) computedStatus = "OPTIMIZING";
    else if (maxEndDate && maxEndDate < today) computedStatus = "EXPIRED";

    this.currentStatus = computedStatus;
  }

  /**
   * Compila il DTO in uscita preservando l'intera mappa delle proprietà dello scope originario.
   */
  exportToData() {
    return {
      ...this.extraProperties,
      id: this.id,
      name: this.name,
      manufacturer: this.manufacturer,
      businessDriver: this.businessDriver,
      category: this.category,
      assetType: this.assetType,
      description: this.description,
      budgetStatusFY27: this.budgetStatusFY27,
      runRate: this.runRate,
      currentStatus: this.currentStatus,
      targetStatus: this.targetStatus,
      costImprovement: this.costImprovement,
      exitDate: this.exitDate,
      transferDate: this.transferDate,
      initiativeTargetDate: this.initiativeTargetDate,
      lastEndDate: this.lastEndDate
    };
  }
}

// ============================================================================
// 3. DATA ACCESS LAYER (REPOSITORY: Responsabile esclusivo delle scritture)
// ============================================================================

class AssetRepository {
  constructor() { this.sheetName = CONFIG.SHEETS.ASSETS; }
  findAll() {
    const rawData = getSheetDataAsObjects(null, this.sheetName) || [];
    return rawData.map(r => new Asset(AssetMapper.toDto(r)));
  }
  saveAll(assetsDomainCollection) {
    const dtos = assetsDomainCollection.map(a => a.exportToData());
    FinOpsDatabase.setObjects(this.sheetName, dtos, ASSET_FIELD_MAP, false);
  }
}

// ============================================================================
// 4. APPLICATION SERVICE LAYER (Orchestratore transazionale dei confini)
// ============================================================================

class AssetService {
  constructor() {
    this.repository = new AssetRepository();
  }

  /**
   * Innesca la transazione di ricalcolo incrociando i flussi asincroni di cassa e scadenze.
   */
  consolidateBudgets() {
    console.log("ASSET SERVICE: Avvio della pipeline di consolidamento Lifecycle...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const assets = this.repository.findAll();
    if (assets.length === 0) return;

    // 🌟 RISOLTO IL TIMEOUT: Rimosse le pesantissime letture di PROJECTIONS e VARIANCE!
    const dtosContracts = (getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || []).map(c => ContractMapper.toDto(c, CONTRACT_FIELD_MAP));
    const dtosInitiatives = (getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || []).map(i => ContractMapper.toDto(i, INITIATIVE_FIELD_MAP));
    
    const updatedAssetsPayload = assets.map(asset => {
      const assetNameLower = asset.name.trim().toLowerCase();
      const assetContracts = dtosContracts.filter(c => String(c.assetName).trim().toLowerCase() === assetNameLower);
      const assetInits = dtosInitiatives.filter(i => String(i.assetName).trim().toLowerCase() === assetNameLower);
      
      // I rami Projections e Variances vengono passati vuoti, ci penserà il Frontend
      asset.injectContext([], assetContracts, assetInits, []);
      return asset;
    });

    this.repository.saveAll(updatedAssetsPayload);
    console.log("ASSET SERVICE: Allineamento e riconciliazione portafoglio concluso (O(1) in RAM).");
  }
}

// Global Singleton Export
const AssetDomain = new AssetService();