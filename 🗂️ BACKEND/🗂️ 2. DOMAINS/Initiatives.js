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
    Object.assign(this, dto);
    this.id = this.id || "";
    this.masterId = this.masterId || "";
    this.contractId = this.contractId || "";
    this.groupId = this.groupId || "";
    this.assetName = this.assetName || "";
    this.supplier = this.supplier || "";
    this.expenditureType = this.expenditureType || "";
    this.baselineAnnualized = parseFloat(this.baselineAnnualized) || 0;
    this.contractTerm = parseFloat(this.contractTerm) || 0;
    this.tags = this.tags || "";
    this.optimizationLevers = this.optimizationLevers || "";
    this.serviceOwner = this.serviceOwner || "";
    this.procurementPoint = this.procurementPoint || this.procurementPointFocal || "";
    this.name = this.name || "";
    this.description = this.description || "";

    this.status = String(this.status || "PLANNED").toUpperCase();
    this.initialStrategy = this.initialStrategy || "";
    this.decision = String(this.decision || "").toUpperCase();

    this.targetDate = this.targetDate ? new Date(this.targetDate) : null;
    this.actualDate = this.actualDate ? new Date(this.actualDate) : null;
    this.contractTermMonths = this.contractTermMonths || "";
    this.lastExpiration = this.lastExpiration ? new Date(this.lastExpiration) : null;

    this.targetCostAnnualized = parseFloat(this.targetCostAnnualized) || 0;
    this.baselineSpendAnnualized = parseFloat(this.baselineSpendAnnualized) || 0;
    this.targetSavingAnnualized = parseFloat(this.targetSavingAnnualized) || 0;
    this.targetSavingPct = parseFloat(this.targetSavingPct) || 0;
    this.newActual = this.newActual !== "" && this.newActual !== undefined ? parseFloat(this.newActual) : "";
    this.actualSavingAnnualized = parseFloat(this.actualSavingAnnualized) || 0;

    this.notes = this.notes || "";
    this.qualityCheck = this.qualityCheck || "";
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
      ...this,
      targetDate: formatServerDate(this.targetDate),
      actualDate: formatServerDate(this.actualDate),
      lastExpiration: formatServerDate(this.lastExpiration)
    };
  }
}

// ============================================================================
// 3. REPOSITORY & SERVICE
// ============================================================================
class InitiativeRepository {
  constructor() { this.sheetName = CONFIG.SHEETS.INITIATIVES; }
  saveAllBulk(initiativesDtoArray) {
    FinOpsDatabase.setObjects(this.sheetName, initiativesDtoArray, INITIATIVE_FIELD_MAP, false);
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