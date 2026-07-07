/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: INITIATIVES DOMAIN (PURE DTO PATTERN)
 * ============================================================================
 * Gestisce i risparmi, le rinegoziazioni e il lookup top-down dal Master Contract.
 * ============================================================================
 */

// ============================================================================
// 1. INFRASTRUCTURE & PERSISTENCE SCHEMA
// ============================================================================
const INITIATIVE_FIELD_MAP = {
  "Initiative ID": "id", "Initiative Name": "name", "Initiative Status": "status",
  "Initial Strategy": "initialStrategy", "Decision": "decision", "Asset Name": "assetName",
  "Master Contract ID": "masterId", "Contract ID": "contractId", "Supplier": "supplier",
  "Baseline (Annualized)": "baselineAnnualized",
  "Contract Term": "contractTerm",
  "Expenditure Type": "expenditureType", "Target Date": "targetDate", "Actual Date": "actualDate",
  "Target Cost (Annualized)": "targetCostAnnualized", "Baseline Spend (Annualized)": "baselineSpendAnnualized",
  "Target Saving (Annualized)": "targetSavingAnnualized", "Target Saving %": "targetSavingPct",
  "New Actual": "newActual", "Actual Saving (Annualized)": "actualSavingAnnualized",
  "Optimization Levers": "optimizationLevers", "Description": "description", "Service Owner": "serviceOwner",
  "Procurement Point": "procurementPoint", "Procurement Point Focal": "procurementPointFocal",
  "Contract Term (Months)": "contractTermMonths", "Last Expiration": "lastExpiration",
  "Tags": "tags", "Notes": "notes", "Quality Check": "qualityCheck"
};

const InitiativeMapper = {
  toDto: (rawRow) => {
    const dto = {};
    const mappedKeys = Object.keys(INITIATIVE_FIELD_MAP);
    const mappedCamelKeys = Object.values(INITIATIVE_FIELD_MAP);

    // Rete di sicurezza (Anti Data-Loss)
    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
        dto[key] = rawRow[key];
      }
    }

    // Mappatura esplicita
    for (let sheetHeader in INITIATIVE_FIELD_MAP) {
      const camelProp = INITIATIVE_FIELD_MAP[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }
    return dto;
  }
};

// ============================================================================
// 2. PURE MODEL DOMAIN ENTITY
// ============================================================================
class Initiative {
  constructor(dto = {}) {
    this.id = dto.id || "";
    this.masterId = dto.masterId || "";
    this.contractId = dto.contractId || "";
    this.groupId = dto.groupId || "";
    this.assetName = dto.assetName || "";
    this.supplier = dto.supplier || "";
    this.expenditureType = dto.expenditureType || "";
    this.baselineAnnualized = parseFloat(dto.baselineAnnualized) || 0;
    this.contractTerm = parseFloat(dto.contractTerm) || 0;
    this.tags = dto.tags || "";
    this.optimizationLevers = dto.optimizationLevers || "";
    this.serviceOwner = dto.serviceOwner || "";
    this.procurementPoint = dto.procurementPoint || dto.procurementPointFocal || "";
    this.name = dto.name || "";
    this.description = dto.description || "";

    this.status = String(dto.status || "PLANNED").toUpperCase();
    this.initialStrategy = dto.initialStrategy || "";
    this.decision = String(dto.decision || "").toUpperCase();

    this.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    this.actualDate = dto.actualDate ? new Date(dto.actualDate) : null;
    this.contractTermMonths = dto.contractTermMonths || "";
    this.lastExpiration = dto.lastExpiration ? new Date(dto.lastExpiration) : null;

    this.targetCostAnnualized = parseFloat(dto.targetCostAnnualized) || 0;
    this.baselineSpendAnnualized = parseFloat(dto.baselineSpendAnnualized) || 0;
    this.targetSavingAnnualized = parseFloat(dto.targetSavingAnnualized) || 0;
    this.targetSavingPct = parseFloat(dto.targetSavingPct) || 0;
    this.newActual = dto.newActual !== "" && dto.newActual !== undefined ? parseFloat(dto.newActual) : "";
    this.actualSavingAnnualized = parseFloat(dto.actualSavingAnnualized) || 0;

    this.notes = dto.notes || "";
    this.qualityCheck = dto.qualityCheck || "";

    this.extraProperties = {};
    const knownKeys = Object.values(INITIATIVE_FIELD_MAP);
    for (let key in dto) {
      if (!knownKeys.includes(key)) this.extraProperties[key] = dto[key];
    }
  }

  injectContext(masterContractData, contractDetails, priorInits = []) {
    const parseFinance = (rawVal) => {
      if (typeof rawVal === 'number') return rawVal;
      if (!rawVal || String(rawVal).trim() === "") return 0;
      const cleaned = String(rawVal).replace(/[^0-9.-]/g, '');
      return parseFloat(cleaned) || 0;
    };

    let targetLocalContract = null;
    if (this.contractId && contractDetails && contractDetails.length > 0) {
      targetLocalContract = contractDetails.find(c =>
        String(c.contractId || c["Contract ID"]).trim() === String(this.contractId).trim()
      );
    }

    if (targetLocalContract) {
      this.supplier = targetLocalContract.supplier || targetLocalContract["Supplier"] || (masterContractData ? (masterContractData.supplier || masterContractData["Supplier"]) : this.supplier);
      this.contractTermMonths = Math.round(parseFloat(targetLocalContract.contractTerm || targetLocalContract["Contract Term (Months)"])) || "";

      // 🌟 PURE LOOKUPS NOMINALE (Senza cascate, bloccata con arrotondamento rigido)
      this.contractTerm = Math.round(parseFloat(targetLocalContract.contractTerm || targetLocalContract["Contract Term (Months)"])) || 0;
      this.baselineAnnualized = parseFinance(targetLocalContract.annualValue || targetLocalContract["Annual Value"]);

      const cEnd = targetLocalContract.adjustedEndDate || targetLocalContract["Adjusted End Date"] || targetLocalContract.contractEndDate || targetLocalContract["Contract End Date"] || targetLocalContract.endDate || targetLocalContract["End Date"];
      this.lastExpiration = cEnd ? new Date(cEnd) : this.lastExpiration;
      this.expenditureType = targetLocalContract.expenditureType || targetLocalContract["Expenditure Type"] || this.expenditureType;

    } else if (masterContractData) {
      this.supplier = masterContractData.supplier || masterContractData["Supplier"] || this.supplier;
      this.contractTermMonths = Math.round(parseFloat(masterContractData.contractTerm || masterContractData["Contract Term (Months)"])) || "";

      // 🌟 PURE LOOKUPS NOMINALE (Senza cascate, bloccata con arrotondamento rigido)
      this.contractTerm = Math.round(parseFloat(masterContractData.contractTerm || masterContractData["Contract Term (Months)"])) || 0;
      this.baselineAnnualized = parseFinance(masterContractData.runRate || masterContractData["Run Rate"]);

      this.lastExpiration = masterContractData.masterEndDate || masterContractData["Master End Date"] ? new Date(masterContractData.masterEndDate || masterContractData["Master End Date"]) : this.lastExpiration;
      if (contractDetails && contractDetails.length > 0) {
        const child = contractDetails.find(c => c["Master Contract ID"] === this.masterId || c.masterId === this.masterId);
        if (child) this.expenditureType = child.expenditureType || child["Expenditure Type"] || this.expenditureType;
      }
    }

    // Calcolo progressivo per l'altro campo ("Baseline Spend") che era già corretto
    let originalBaseline = targetLocalContract ? parseFinance(targetLocalContract.annualValue || targetLocalContract["Annual Value"]) : (masterContractData ? parseFinance(masterContractData.runRate || masterContractData["Run Rate"]) : 0);
    let startingCost = originalBaseline;
    if (originalBaseline !== 0 && this.targetDate && !isNaN(this.targetDate.getTime())) {
      const validPriors = priorInits.filter(i => {
        const iDate = i.targetDate;
        return iDate && !isNaN(iDate.getTime()) && iDate < this.targetDate && i.targetCostAnnualized !== undefined && i.targetCostAnnualized !== "";
      });
      if (validPriors.length > 0) {
        validPriors.sort((a, b) => b.targetDate - a.targetDate);
        startingCost = parseFinance(validPriors[0].targetCostAnnualized);
      }
    }
    this.baselineSpendAnnualized = startingCost;
    this._recalculateFinancials();
  }

  _recalculateFinancials() {
    if (this.targetCostAnnualized >= 0 && !["TERMINATE", "REPLACE", "TRANSFER"].includes(this.decision)) {
      this.targetSavingAnnualized = this.baselineSpendAnnualized - this.targetCostAnnualized;
    } else if (["TERMINATE", "REPLACE", "TRANSFER"].includes(this.decision)) {
      this.targetSavingAnnualized = this.baselineSpendAnnualized;
    }

    this.targetSavingPct = this.baselineSpendAnnualized > 0 ? (this.targetSavingAnnualized / this.baselineSpendAnnualized) : 0;

    if (this.status === "COMPLETED") {
      this.actualSavingAnnualized = (this.newActual !== "") ? (this.baselineSpendAnnualized - this.newActual) : this.targetSavingAnnualized;
    } else {
      this.actualSavingAnnualized = 0;
      this.newActual = "";
    }
  }

  getEffectiveDate() {
    return (this.actualDate && !isNaN(this.actualDate.getTime())) ? this.actualDate : this.targetDate;
  }

  exportToData() {
    return {
      ...this.extraProperties,
      id: this.id, masterId: this.masterId, contractId: this.contractId, assetName: this.assetName,
      supplier: this.supplier, expenditureType: this.expenditureType, tags: this.tags,
      optimizationLevers: this.optimizationLevers, serviceOwner: this.serviceOwner,
      procurementPoint: this.procurementPoint, procurementPointFocal: this.procurementPoint,
      name: this.name, description: this.description, status: this.status,
      baselineAnnualized: this.baselineAnnualized,
      contractTerm: this.contractTerm,
      initialStrategy: this.initialStrategy, decision: this.decision,
      targetDate: formatServerDate(this.targetDate), actualDate: formatServerDate(this.actualDate),
      contractTermMonths: this.contractTermMonths, lastExpiration: formatServerDate(this.lastExpiration),
      targetCostAnnualized: this.targetCostAnnualized, baselineSpendAnnualized: this.baselineSpendAnnualized,
      targetSavingAnnualized: this.targetSavingAnnualized, targetSavingPct: this.targetSavingPct,
      newActual: this.newActual, actualSavingAnnualized: this.actualSavingAnnualized,
      notes: this.notes, qualityCheck: this.qualityCheck
    };
  }
}

// ============================================================================
// 3. REPOSITORY & SERVICE
// ============================================================================
class InitiativeRepository {
  constructor() { this.sheetName = CONFIG.SHEETS.INITIATIVES; }
  saveAllBulk(initiativesDtoArray) {
    const ctx = getSheetContext(this.sheetName);
    if (!ctx.sheet || initiativesDtoArray.length === 0) return;
    const rows = initiativesDtoArray.map(dto => ctx.headers.map(h => INITIATIVE_FIELD_MAP[h] ? dto[INITIATIVE_FIELD_MAP[h]] : (dto[h] !== undefined ? dto[h] : "")));
    if (ctx.sheet.getLastRow() > 1) ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.headers.length).clearContent();
    ctx.sheet.getRange(2, 1, rows.length, ctx.headers.length).setValues(rows);
  }
}

class InitiativeService {
  constructor() { this.repository = new InitiativeRepository(); }

  processAndSync(rawInitiativesArray) {
    if (!rawInitiativesArray || !Array.isArray(rawInitiativesArray)) return "SUCCESS";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const activeContracts = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];

    const finalExportedPayloads = rawInitiativesArray.map((rawInit, idx) => {
      const dto = InitiativeMapper.toDto(rawInit);
      const initiative = new Initiative(dto);

      const parentMaster = activeMasters.find(m => String(m.masterId || m["Master Contract ID"]).trim() === String(initiative.masterId).trim());
      const childContracts = activeContracts.filter(c => String(c.masterId || c["Master Contract ID"]).trim() === String(initiative.masterId).trim());

      initiative.injectContext(parentMaster, childContracts);
      if (!initiative.id) initiative.id = `INC-FIN-${new Date().getFullYear()}-${String(idx + 1).padStart(2, '0')}`;

      return initiative.exportToData();
    });

    this.repository.saveAllBulk(finalExportedPayloads);
    return "SUCCESS";
  }

  forceRecalculateAll() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
    this.processAndSync(allInits);
  }
}
const InitiativeDomain = new InitiativeService();