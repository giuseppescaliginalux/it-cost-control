/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: CONTRACTS DOMAIN (PURE DTO PATTERN)
 * ============================================================================
 * Gestisce l'intero ciclo di vita dei contratti attivi, dei master agreements,
 * delle regole di allocazione dei costi (Splits) e dei flussi reali (Ledger).
 * Applica una forte incapsulazione I/O tramite Mappers e Field Maps locali.
 * ============================================================================
 */

// ============================================================================
// 1. INFRASTRUCTURE & PERSISTENCE SCHEMA (Alta Coesione Locale)
// ============================================================================

const MASTER_FIELD_MAP = {
  "Master Contract ID": "masterId", "Previous Master ID": "previousMasterId",
  "Asset Name": "assetName", "Asset ID": "assetId", "Supplier": "supplier",
  "Scope": "masterScope", "Comments": "masterComments", "Contract Links": "contractLinks",
  "Status": "status", "Master Start Date": "masterStartDate", "Master End Date": "masterEndDate",
  "Contract Term (Months)": "contractTerm", "Total Commitment": "totalCommitment",
  "Run Rate": "runRate", "Billing Channel": "billingChannel"
};

const CONTRACT_FIELD_MAP = {
  "Contract ID": "contractId", "Master Contract ID": "masterId", "Legal Entity": "legalEntity",
  "Location": "location", "Service Owner": "serviceOwner", "Scope": "scope",
  "Cost Recurrence": "costRecurrence", "Pricing Model": "pricingModel", "Billing Terms": "billingTerms",
  "Total Commitment": "totalCommitment", "Expenditure Type": "expenditureType", "Cost Center": "costCenter",
  "Start Date": "startDate", "Contract End Date": "contractEndDate", "Adjusted End Date": "adjustedEndDate",
  "End Date": "endDate", "Notice Period (Days)": "noticePeriod", "Auto-Renewal": "autoRenewal",
  "BL ID": "blId", "Request Code": "requestCode", "Comments": "comments", "Contract Links": "contractLinks",
  "Status": "status", "Contract Term (Months)": "contractTerm", "Effective Commitment": "effectiveCommitment",
  "Annual Value": "annualValue", "Asset Name": "assetName", "Supplier": "supplier", "Billing Channel": "billingChannel"
};

const SPLIT_FIELD_MAP = {
  "Split ID": "splitId", "Contract ID": "contractId", "Target Legal Entity": "targetLegalEntity",
  "Target Cost Center": "targetCostCenter", "Allocation Rule": "allocationRule",
  "Percentage Share": "percentageShare", "Fixed Amount": "fixedAmount",
  "Units Assigned": "unitsAssigned", "Valid From": "validFrom", "Valid To": "validTo", "Notes": "notes"
};

const LEDGER_FIELD_MAP = {
  "Contract ID": "contractId", "Start Date": "startDate", "End Date": "endDate",
  "Type": "type", "Amount": "amount", "Notes": "notes"
};

const EDITABLE_MASTER = ["Supplier", "Scope", "Comments", "Contract Links"];
const EDITABLE_CONTRACTS = [
  "Legal Entity", "Location", "Service Owner", "Scope", "Cost Recurrence",
  "Pricing Model", "Billing Terms", "Total Commitment", "Expenditure Type",
  "Cost Center", "Start Date", "Contract End Date", "Adjusted End Date",
  "Notice Period (Days)", "Auto-Renewal", "BL ID", "Request Code", "Comments", "Contract Links"
];

/**
 * @object ContractMapper
 * @description Muro di contenimento: trasforma le stringhe fisiche del foglio Google in DTO puri in camelCase.
 * Applica una rete di salvataggio (Anti Data-Loss) per le colonne extra non censite.
 */
const ContractMapper = {
  toDto: (rawRow, fieldMap) => {
    const dto = {};
    const mappedKeys = Object.keys(fieldMap);
    const mappedCamelKeys = Object.values(fieldMap);

    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
        dto[key] = rawRow[key];
      }
    }

    for (let sheetHeader in fieldMap) {
      const camelProp = fieldMap[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }

    return dto;
  }
};

// ============================================================================
// 2. DOMAIN ENTITIES (Logica Matematica e Relazionale Pura)
// ============================================================================

class LedgerMovement {
  constructor(dto = {}) {
    this.contractId = dto.contractId || "";
    this.startDate = dto.startDate ? new Date(dto.startDate) : null;
    this.endDate = dto.endDate ? new Date(dto.endDate) : null;
    this.type = String(dto.type || "ACTUAL").toUpperCase();
    this.amount = parseFloat(dto.amount) || 0;
    this.notes = dto.notes || "";

    this.extraProperties = {};
    const knownKeys = Object.values(LEDGER_FIELD_MAP);
    for (let key in dto) if (!knownKeys.includes(key)) this.extraProperties[key] = dto[key];
  }

  isForecast() { return this.type === "FORECAST" || this.type === "CALCULATED"; }
  isActual() { return this.type === "ACTUAL"; }

  exportToData() {
    return {
      ...this.extraProperties,
      contractId: this.contractId,
      startDate: formatServerDate(this.startDate),
      endDate: formatServerDate(this.endDate),
      type: this.type,
      amount: this.amount,
      notes: this.notes
    };
  }
}

class AllocationSplit {
  constructor(dto = {}) {
    this.splitId = dto.splitId || "SPL-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    this.contractId = dto.contractId || "";
    this.targetLegalEntity = dto.targetLegalEntity || "";
    this.targetCostCenter = dto.targetCostCenter || "";
    this.allocationRule = dto.allocationRule || "Percentage";

    this.percentageShare = dto.percentageShare !== undefined ? dto.percentageShare : "";
    this.fixedAmount = parseFloat(dto.fixedAmount) || 0;
    this.unitsAssigned = parseFloat(dto.unitsAssigned) || 0;

    this.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    this.validTo = dto.validTo ? new Date(dto.validTo) : null;
    this.notes = dto.notes || "";

    this.extraProperties = {};
    const knownKeys = Object.values(SPLIT_FIELD_MAP);
    for (let key in dto) if (!knownKeys.includes(key)) this.extraProperties[key] = dto[key];
  }

  isPercentage() { return this.allocationRule === "Percentage"; }

  getRawPercentage() {
    if (!this.isPercentage() || this.percentageShare === "") return 0;
    let val = parseFloat(this.percentageShare);
    return val <= 1 ? val * 100 : val;
  }

  exportToData() {
    let outPct = "";
    if (this.isPercentage() && this.percentageShare !== "") {
      let val = parseFloat(this.percentageShare);
      outPct = val > 1 ? val / 100 : val;
    }
    return {
      ...this.extraProperties,
      splitId: this.splitId,
      contractId: this.contractId,
      targetLegalEntity: this.targetLegalEntity,
      targetCostCenter: this.targetCostCenter,
      allocationRule: this.allocationRule,
      percentageShare: outPct,
      fixedAmount: this.allocationRule === "Fixed Amount" ? this.fixedAmount : "",
      unitsAssigned: this.allocationRule === "Units" ? this.unitsAssigned : "",
      validFrom: formatServerDate(this.validFrom),
      validTo: formatServerDate(this.validTo),
      notes: this.notes
    };
  }
}

class Contract {
  constructor(dto = {}) {
    this.id = dto.contractId || dto.id || "";
    this.masterId = dto.masterId || "";
    this.assetName = dto.assetName || "";
    this.supplier = dto.supplier || "";
    this.billingChannel = dto.billingChannel || "";
    this.legalEntity = dto.legalEntity || "";
    this.location = dto.location || "";
    this.serviceOwner = dto.serviceOwner || "";
    this.scope = dto.scope || "";
    this.expenditureType = dto.expenditureType || "";
    this.costCenter = dto.costCenter || "";

    this.startDate = dto.startDate ? new Date(dto.startDate) : null;
    this.contractEndDate = dto.contractEndDate ? new Date(dto.contractEndDate) : null;
    this.adjustedEndDate = dto.adjustedEndDate ? new Date(dto.adjustedEndDate) : null;

    this.costRecurrence = dto.costRecurrence || "Recurrent";
    this.pricingModel = dto.pricingModel || "Flat";
    this.billingTerms = dto.billingTerms || "Linear";

    this.totalCommitment = parseFloat(dto.totalCommitment) || 0;
    this.annualValue = parseFloat(dto.annualValue) || 0;

    this.noticePeriod = dto.noticePeriod || "";
    this.autoRenewal = dto.autoRenewal || "";
    this.blId = dto.blId || "";
    this.requestCode = dto.requestCode || "";
    this.comments = dto.comments || "";
    this.contractLinks = dto.contractLinks || "";

    this.ledger = [];
    this.splits = [];

    this.extraProperties = {};
    const knownKeys = Object.values(CONTRACT_FIELD_MAP);
    for (let key in dto) if (!knownKeys.includes(key)) this.extraProperties[key] = dto[key];
  }

  getEndDate() {
    return (this.adjustedEndDate && !isNaN(this.adjustedEndDate.getTime())) ? this.adjustedEndDate : this.contractEndDate;
  }

  _getExactMonths(s, e) {
    if (!s || !e || s > e) return 0;
    const startDaysInMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
    const endDaysInMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();

    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
      return (e.getDate() - s.getDate() + 1) / startDaysInMonth;
    }

    const fullMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) - 1;
    const sFrac = (startDaysInMonth - s.getDate() + 1) / startDaysInMonth;
    const eFrac = e.getDate() / endDaysInMonth;

    return fullMonths + sFrac + eFrac;
  }

  getDurationMonths() {
    return parseFloat(this._getExactMonths(this.startDate, this.getEndDate()).toFixed(4));
  }

  getEffectiveCommitment() {
    if (this.costRecurrence === "One-Shot") return parseFloat(this.totalCommitment.toFixed(2));
    if (!this.startDate || !this.contractEndDate || !this.getEndDate()) return 0;

    const origMonths = this._getExactMonths(this.startDate, this.contractEndDate);
    const actMonths = this._getExactMonths(this.startDate, this.getEndDate());

    return parseFloat((this.totalCommitment * (actMonths / (origMonths || 1))).toFixed(2));
  }

  getAnnualValue() {
    if (this.costRecurrence === "One-Shot") return parseFloat(this.totalCommitment.toFixed(2));
    if (!this.startDate || !this.contractEndDate) return 0;

    const origMonths = this._getExactMonths(this.startDate, this.contractEndDate);
    return parseFloat(((this.totalCommitment / Math.max(0.0001, origMonths)) * 12).toFixed(2));
  }

  calculateStatus() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = this.getEndDate();

    if (!this.startDate) return "";
    if (endDate && endDate < today) return "EXPIRED";
    if (this.startDate > today) return "UPCOMING";
    return "ACTIVE";
  }

  validateIntegrity() {
    const pctSplits = this.splits.filter(s => s.isPercentage());
    if (pctSplits.length > 0) {
      const totalPct = pctSplits.reduce((sum, s) => sum + s.getRawPercentage(), 0);
      if (totalPct > 100.001) {
        throw new Error(`Policy Violation: Gli split del contratto ${this.id} ammontano al ${totalPct}%, superando il 100%.`);
      }
    }
  }

  exportToData() {
    return {
      ...this.extraProperties,
      contractId: this.id,
      masterId: this.masterId, // Riceve top-down lookup dal Master
      assetName: this.assetName,
      supplier: this.supplier,
      billingChannel: this.billingChannel,
      legalEntity: this.legalEntity,
      location: this.location,
      serviceOwner: this.serviceOwner,
      scope: this.scope,
      costRecurrence: this.costRecurrence,
      pricingModel: this.pricingModel,
      billingTerms: this.billingTerms,
      totalCommitment: this.totalCommitment,
      expenditureType: this.expenditureType,
      costCenter: this.costCenter,
      startDate: formatServerDate(this.startDate),
      contractEndDate: formatServerDate(this.contractEndDate),
      adjustedEndDate: formatServerDate(this.adjustedEndDate),
      endDate: formatServerDate(this.getEndDate()),
      noticePeriod: this.noticePeriod,
      autoRenewal: this.autoRenewal,
      blId: this.blId,
      requestCode: this.requestCode,
      comments: this.comments,
      contractLinks: this.contractLinks,
      contractTerm: this.getDurationMonths(),
      effectiveCommitment: this.getEffectiveCommitment(),
      annualValue: this.getAnnualValue(),
      status: this.calculateStatus()
    };
  }

  generateForecastLedger() {
    const pm = String(this.pricingModel).toUpperCase().trim();
    const bt = String(this.billingTerms).toUpperCase().trim();

    const isForecastable = pm === "MINIMUM CONSUMPTION" || pm === "CAPPED CONSUMPTION";
    if (!isForecastable) return [];
    if (bt === "FULL UPFRONT") return []; // L'Upfront puro disattiva l'autogenerazione mensile
    if (this.costRecurrence === "One-Shot" || !this.startDate || !this.getEndDate()) return [];

    const movements = [];
    const finalEnd = this.getEndDate();
    let currentCursor = new Date(this.startDate.getTime());

    let stepMonths = 1;
    let periodAmount = this.getAnnualValue() / 12;
    let labelType = "Monthly";

    if (bt === "QUARTERLY") {
      stepMonths = 3;
      periodAmount = this.getAnnualValue() / 4;
      labelType = "Quarterly";
    }

    while (currentCursor <= finalEnd) {
      const chunkStart = new Date(currentCursor.getTime());
      const chunkEnd = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + stepMonths, 0);
      const actualEnd = chunkEnd > finalEnd ? finalEnd : chunkEnd;

      movements.push(new LedgerMovement({
        contractId: this.id,
        startDate: formatServerDate(chunkStart),
        endDate: formatServerDate(actualEnd),
        type: "CALCULATED",
        amount: parseFloat(periodAmount.toFixed(2)),
        notes: `Engine-generated forecast (${labelType}) starting ${chunkStart.toLocaleString('default', { month: 'short' })} ${chunkStart.getFullYear()}`
      }));

      currentCursor = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + stepMonths, 1);
    }

    return movements;
  }

  exportFullLedger() {
    const fullLedger = [];

    // ⚡ Filtro Rigido: Pulisce i vecchi CALCULATED autogenerati, ma preserva
    // per QUALSIASI contratto tutti gli ACTUAL e i FORECAST manuali inseriti "on top" dall'utente
    this.ledger.forEach(l => {
      if (l.type !== "CALCULATED") {
        fullLedger.push(l.exportToData());
      }
    });

    // Accoda le proiezioni predittive fresche (solo per chi ne ha diritto)
    this.generateForecastLedger().forEach(f => fullLedger.push(f.exportToData()));

    return fullLedger;
  }
}

class MasterContract {
  constructor(dto = {}) {
    this.id = dto.masterId || "";
    this.previousMasterId = dto.previousMasterId || "";
    this.supplier = dto.supplier || "";
    this.assetName = dto.assetName || "";
    this.billingChannel = dto.billingChannel || "";
    this.masterScope = dto.masterScope || "";
    this.masterComments = dto.masterComments || "";
    this.contractLinks = dto.contractLinks || "";
    this.childContracts = [];

    this.extraProperties = {};
    const knownKeys = Object.values(MASTER_FIELD_MAP);
    for (let key in dto) if (!knownKeys.includes(key)) this.extraProperties[key] = dto[key];
  }

  addChild(contractInstance) {
    // Top-Down Lookup Injection
    contractInstance.masterId = this.id;
    contractInstance.supplier = this.supplier;
    contractInstance.assetName = this.assetName;
    contractInstance.billingChannel = this.billingChannel;
    this.childContracts.push(contractInstance);
  }

  getMinStartDate() {
    let min = null;
    this.childContracts.forEach(c => {
      if (c.startDate && (!min || c.startDate < min)) min = c.startDate;
    });
    return min;
  }

  getMaxEndDate() {
    let max = null;
    this.childContracts.forEach(c => {
      const e = c.getEndDate();
      if (e && (!max || e > max)) max = e;
    });
    return max;
  }

  getTotalCommitment() {
    return parseFloat(this.childContracts.reduce((sum, c) => sum + c.getEffectiveCommitment(), 0).toFixed(2));
  }

  getRunRate() {
    const recurrentContracts = this.childContracts.filter(c => String(c.costRecurrence).toLowerCase() === "recurrent");
    const start = this.getMinStartDate();
    const end = this.getMaxEndDate();
    if (!start || !end || recurrentContracts.length === 0) return 0;

    const masterDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const masterTermMonths = Math.max(1, Math.round(masterDays / 30.4166));

    const totalRecurrentEff = recurrentContracts.reduce((sum, c) => sum + c.getEffectiveCommitment(), 0);
    return parseFloat(((totalRecurrentEff / masterTermMonths) * 12).toFixed(2));
  }

  deriveStatus(linkedInitiatives) {
    let checkTerminated = 0;
    let checkNegotiation = 0;
    const hasActiveChilds = this.childContracts.some(c => c.calculateStatus() === "ACTIVE");

    linkedInitiatives.forEach(init => {
      const initStatus = String(init["Initiative Status"] || init.status || "").toUpperCase();
      const decision = String(init["Decision"] || init.decision || "").toUpperCase();
      if (initStatus === "COMPLETED" && ["TERMINATE", "REPLACE", "TRANSFER"].includes(decision)) checkTerminated++;
      if (initStatus === "IN PROGRESS") checkNegotiation++;
    });

    if (checkTerminated > 0) return "TERMINATED";
    if (hasActiveChilds) return "ACTIVE";
    if (checkNegotiation > 0) return "IN NEGOTIATION";
    return "EXPIRED";
  }

  exportToData(linkedInitiatives) {
    return {
      ...this.extraProperties,
      masterId: this.id,
      previousMasterId: this.previousMasterId,
      assetName: this.assetName,
      supplier: this.supplier,
      masterScope: this.masterScope,
      masterComments: this.masterComments,
      contractLinks: this.contractLinks,
      billingChannel: this.billingChannel,
      masterStartDate: formatServerDate(this.getMinStartDate()),
      masterEndDate: formatServerDate(this.getMaxEndDate()),
      totalCommitment: this.getTotalCommitment(),
      runRate: this.getRunRate(),
      status: this.deriveStatus(linkedInitiatives)
    };
  }
}

// ============================================================================
// 3. DATA ACCESS LAYER (REPOSITORY) - BULK O(1) OVERWRITE
// ============================================================================

class ContractRepository {

  saveMasterRow(masterDto) {
    const ctx = getSheetContext(CONFIG.SHEETS.MASTER_CONTRACTS);
    const idCol = ctx.headers.indexOf("Master Contract ID");
    let rowIdx = -1;
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][idCol]).trim() === String(masterDto.masterId).trim()) { rowIdx = i + 1; break; }
    }
    // DatabaseUtils gestisce il dictionary di Mapping in modo sicuro
    if (rowIdx > 0) { updateRowSafe(ctx.sheet, rowIdx, ctx.headers, masterDto, EDITABLE_MASTER, MASTER_FIELD_MAP); }
    else {
      let newRow = new Array(ctx.headers.length).fill("");
      newRow[idCol] = masterDto.masterId;
      ctx.sheet.appendRow(newRow);
      updateRowSafe(ctx.sheet, ctx.sheet.getLastRow(), ctx.headers, masterDto, EDITABLE_MASTER, MASTER_FIELD_MAP);
    }
  }

  saveDetailsCollection(masterId, detailsDtoArray) {
    const ctx = getSheetContext(CONFIG.SHEETS.CONTRACTS);
    const mIdCol = ctx.headers.indexOf("Master Contract ID");
    const cIdCol = ctx.headers.indexOf("Contract ID");

    const dbRowsMap = new Map();
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][mIdCol]).trim() === String(masterId).trim()) { dbRowsMap.set(String(ctx.data[i][cIdCol]).trim(), i + 1); }
    }
    detailsDtoArray.forEach(detail => {
      const cid = String(detail.contractId).trim();
      if (dbRowsMap.has(cid)) {
        updateRowSafe(ctx.sheet, dbRowsMap.get(cid), ctx.headers, detail, EDITABLE_CONTRACTS, CONTRACT_FIELD_MAP);
        dbRowsMap.delete(cid);
      } else {
        let newRow = new Array(ctx.headers.length).fill("");
        if (mIdCol > -1) newRow[mIdCol] = masterId;
        if (cIdCol > -1) newRow[cIdCol] = detail.contractId;
        ctx.sheet.appendRow(newRow);
        updateRowSafe(ctx.sheet, ctx.sheet.getLastRow(), ctx.headers, detail, EDITABLE_CONTRACTS, CONTRACT_FIELD_MAP);
      }
    });
    const toDelete = Array.from(dbRowsMap.values()).sort((a, b) => b - a);
    toDelete.forEach(idx => ctx.sheet.deleteRow(idx));
  }

  wipeAndWriteSplits(contractIds, splitsDtoArray) {
    if (contractIds.length === 0) return;
    const ctx = getSheetContext(CONFIG.SHEETS.ALLOCATION_SPLITS);
    if (!ctx.sheet) return;
    const cIdCol = ctx.headers.indexOf("Contract ID");
    for (let i = ctx.data.length - 1; i >= 1; i--) {
      if (contractIds.includes(String(ctx.data[i][cIdCol]).trim())) ctx.sheet.deleteRow(i + 1);
    }
    this._bulkOverwrite(CONFIG.SHEETS.ALLOCATION_SPLITS, splitsDtoArray, SPLIT_FIELD_MAP, true);
  }

  wipeAndWriteLedger(contractIds, ledgerDtoArray) {
    if (contractIds.length === 0) return;
    const ctx = getSheetContext(CONFIG.SHEETS.LEDGER);
    if (!ctx.sheet) return;
    const cIdCol = ctx.headers.indexOf("Contract ID");
    for (let i = ctx.data.length - 1; i >= 1; i--) {
      if (contractIds.includes(String(ctx.data[i][cIdCol]).trim())) ctx.sheet.deleteRow(i + 1);
    }
    this._bulkOverwrite(CONFIG.SHEETS.LEDGER, ledgerDtoArray, LEDGER_FIELD_MAP, true);
  }

  overwriteAllMasters(mastersArray) { this._bulkOverwrite(CONFIG.SHEETS.MASTER_CONTRACTS, mastersArray, MASTER_FIELD_MAP); }
  overwriteAllContracts(contractsArray) { this._bulkOverwrite(CONFIG.SHEETS.CONTRACTS, contractsArray, CONTRACT_FIELD_MAP); }
  overwriteAllSplits(splitsArray) { this._bulkOverwrite(CONFIG.SHEETS.ALLOCATION_SPLITS, splitsArray, SPLIT_FIELD_MAP); }
  overwriteAllLedger(ledgerArray) { this._bulkOverwrite(CONFIG.SHEETS.LEDGER, ledgerArray, LEDGER_FIELD_MAP); }

  _bulkOverwrite(sheetName, dataObjectsArray, fieldMap, appendMode = false) {
    const ctx = getSheetContext(sheetName);
    if (!ctx.sheet) return;

    if (!appendMode && ctx.sheet.getLastRow() > 1) {
      ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.headers.length).clearContent();
    }
    if (dataObjectsArray.length === 0) return;

    const rows = dataObjectsArray.map(obj => {
      return ctx.headers.map(header => {
        if (fieldMap && fieldMap[header]) {
          const prop = fieldMap[header];
          return obj[prop] !== undefined ? obj[prop] : (obj[header] !== undefined ? obj[header] : "");
        }
        return obj[header] !== undefined ? obj[header] : "";
      });
    });

    const startRow = appendMode ? ctx.sheet.getLastRow() + 1 : 2;
    ctx.sheet.getRange(startRow, 1, rows.length, ctx.headers.length).setValues(rows);
  }
}

// ============================================================================
// 4. BUSINESS LOGIC LAYER (SERVICE) - HASH MAP OPTIMIZED
// ============================================================================

class ContractService {
  constructor() {
    this.repository = new ContractRepository();
  }

  generateId(prefix, supplier, assetName, year, count) {
    const cleanSupplier = String(supplier || "GEN").replace(/[aeiou.,\s]/gi, "").substring(0, 4).toUpperCase();
    const cleanAsset = String(assetName || "AST").replace(/[aeiou.,\s]/gi, "").substring(0, 4).toUpperCase();
    const padCount = count < 10 ? "0" + count : count;
    return `${prefix}-${cleanSupplier}-${cleanAsset}-${year}-${padCount}`;
  }

  removeDuplicatesByKey(array, key) {
    const seen = new Set();
    return array.filter(item => {
      const val = String(item[key] || "").trim();
      if (val === "") return true;
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  }

  groupBy(array, possibleKeys) {
    const map = {};
    array.forEach(item => {
      let val = "";
      for (let k of possibleKeys) {
        if (item[k] !== undefined && item[k] !== "") {
          val = String(item[k]).trim();
          break;
        }
      }
      if (val) {
        if (!map[val]) map[val] = [];
        map[val].push(item);
      }
    });
    return map;
  }

  processAndSync(payload) {
    console.log("CONTRACT DOMAIN: Elaborazione Payload UI in DTO...");

    // Il payload della UI utilizza già le chiavi DTO
    const master = new MasterContract({
      ...payload,
      billingChannel: payload.billingChannel || (payload.details.length > 0 ? payload.details[0].billingChannel : "")
    });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ctxContracts = getSheetContext(CONFIG.SHEETS.CONTRACTS);
    const supColIdx = ctxContracts.headers.indexOf("Supplier");
    let globalSupplierCount = 0;
    for (let i = 1; i < ctxContracts.data.length; i++) {
      if (String(ctxContracts.data[i][supColIdx]).toLowerCase().trim() === String(payload.supplier).toLowerCase().trim()) {
        globalSupplierCount++;
      }
    }

    payload.details.forEach(dtoDetail => {
      const contract = new Contract(dtoDetail);
      if (dtoDetail.ledger && Array.isArray(dtoDetail.ledger)) {
        dtoDetail.ledger.forEach(l => contract.ledger.push(new LedgerMovement(l)));
      }
      if (dtoDetail.splits && Array.isArray(dtoDetail.splits)) {
        dtoDetail.splits.forEach(s => contract.splits.push(new AllocationSplit(s)));
      }
      contract.validateIntegrity();
      master.addChild(contract);
    });

    if (!master.id) {
      const allMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
      const mCount = allMasters.filter(m => String(m["Supplier"]).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
      const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
      master.id = this.generateId("MCT", master.supplier, payload.assetName, mYear, mCount);
    }

    master.childContracts.forEach(c => {
      if (!c.id) {
        globalSupplierCount++;
        const cYear = c.startDate ? c.startDate.getFullYear() : new Date().getFullYear();
        c.id = this.generateId("CTR", master.supplier, payload.assetName, cYear, globalSupplierCount);
        c.splits.forEach(s => s.contractId = c.id);
        c.ledger.forEach(l => l.contractId = c.id);
      }
      c.masterId = master.id;
    });

    const exportedMaster = master.exportToData(payload.initiatives || []);
    const exportedDetails = master.childContracts.map(c => c.exportToData());

    let exportedSplits = [];
    let exportedLedger = [];
    master.childContracts.forEach(c => {
      exportedSplits = exportedSplits.concat(c.splits.map(s => s.exportToData()));
      exportedLedger = exportedLedger.concat(c.exportFullLedger());
    });

    const contractIds = master.childContracts.map(c => c.id);
    this.repository.saveMasterRow(exportedMaster);
    this.repository.saveDetailsCollection(master.id, exportedDetails);
    this.repository.wipeAndWriteSplits(contractIds, exportedSplits);
    this.repository.wipeAndWriteLedger(contractIds, exportedLedger);

    console.log(`CONTRACT DOMAIN: Sincronizzazione Master [${master.id}] completata.`);
    return "SUCCESS";
  }

  forceRecalculateAll() {
    console.log("CONTRACT DOMAIN: Avvio ricalcolo massivo forzato (BULK MODE in RAM)...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const rawMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allMasters = this.removeDuplicatesByKey(rawMasters, "Master Contract ID");

    const rawDetails = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];
    const allDetails = this.removeDuplicatesByKey(rawDetails, "Contract ID");

    const allSplits = getSheetDataAsObjects(ss, CONFIG.SHEETS.ALLOCATION_SPLITS) || [];
    const allLedger = getSheetDataAsObjects(ss, CONFIG.SHEETS.LEDGER) || [];
    const allInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];

    // Idratazione Bulk in DTO puri in RAM
    const dtosMasters = allMasters.map(r => ContractMapper.toDto(r, MASTER_FIELD_MAP));
    const dtosDetails = allDetails.map(r => ContractMapper.toDto(r, CONTRACT_FIELD_MAP));
    const dtosSplits = allSplits.map(r => ContractMapper.toDto(r, SPLIT_FIELD_MAP));
    const dtosLedger = allLedger.map(r => ContractMapper.toDto(r, LEDGER_FIELD_MAP));

    // Indicizzazione O(1) basata sulle chiavi DTO
    const detailsByMaster = this.groupBy(dtosDetails, ["masterId"]);
    const splitsByContract = this.groupBy(dtosSplits, ["contractId"]);
    const ledgerByContract = this.groupBy(dtosLedger, ["contractId"]);
    // Le Iniziative rimangono grezze per derivare lo status
    const initsByMaster = this.groupBy(allInits, ["Master Contract ID"]);

    let finalMasters = [];
    let finalDetails = [];
    let finalSplits = [];
    let finalLedger = [];

    let globalSupplierCount = dtosDetails.length;

    dtosMasters.forEach(dtoMaster => {
      const mId = dtoMaster.masterId;
      const detailsForMaster = detailsByMaster[mId] || [];
      const masterInits = initsByMaster[mId] || [];

      const master = new MasterContract({
        ...dtoMaster,
        billingChannel: dtoMaster.billingChannel || (detailsForMaster.length > 0 ? detailsForMaster[0].billingChannel : "")
      });

      detailsForMaster.forEach(dtoDetail => {
        const contract = new Contract(dtoDetail);

        const linkedLedger = ledgerByContract[contract.id] || [];
        linkedLedger.forEach(dtoL => contract.ledger.push(new LedgerMovement(dtoL)));

        const linkedSplits = splitsByContract[contract.id] || [];
        linkedSplits.forEach(dtoS => contract.splits.push(new AllocationSplit(dtoS)));

        contract.validateIntegrity();
        master.addChild(contract);
      });

      if (!master.id) {
        const mCount = finalMasters.filter(fm => String(fm.supplier).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
        const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
        master.id = this.generateId("MCT", master.supplier, master.assetName, mYear, mCount);
      }

      master.childContracts.forEach(c => {
        if (!c.id) {
          globalSupplierCount++;
          const cYear = c.startDate ? c.startDate.getFullYear() : new Date().getFullYear();
          c.id = this.generateId("CTR", master.supplier, master.assetName, cYear, globalSupplierCount);
          c.splits.forEach(s => s.contractId = c.id);
          c.ledger.forEach(l => l.contractId = c.id);
        }
        c.masterId = master.id;
      });

      finalMasters.push(master.exportToData(masterInits));

      master.childContracts.forEach(c => {
        finalDetails.push(c.exportToData());
        c.splits.forEach(s => finalSplits.push(s.exportToData()));
        finalLedger = finalLedger.concat(c.exportFullLedger());
      });
    });

    this.repository.overwriteAllMasters(finalMasters);
    this.repository.overwriteAllContracts(finalDetails);
    this.repository.overwriteAllSplits(finalSplits);
    this.repository.overwriteAllLedger(finalLedger);

    console.log("CONTRACT DOMAIN: Ricalcolo massivo Bulk O(1) completato.");
  }

  /**
   * ⚡ API DI DOMINIO APERTA: Restituisce la collezione completa di tutti i contratti
   * vivi nel sistema, già idratati in RAM con i rispettivi Split e Ledger.
   * @returns {Contract[]} Array di istanze pure della classe Contract
   */
  getHydratedContracts() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const rawMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allMasters = this.removeDuplicatesByKey(rawMasters, "Master Contract ID");

    const rawDetails = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];
    const allDetails = this.removeDuplicatesByKey(rawDetails, "Contract ID");

    const allSplits = getSheetDataAsObjects(ss, CONFIG.SHEETS.ALLOCATION_SPLITS) || [];
    const allLedger = getSheetDataAsObjects(ss, CONFIG.SHEETS.LEDGER) || [];

    const dtosMasters = allMasters.map(r => ContractMapper.toDto(r, MASTER_FIELD_MAP));
    const dtosDetails = allDetails.map(r => ContractMapper.toDto(r, CONTRACT_FIELD_MAP));
    const dtosSplits = allSplits.map(r => ContractMapper.toDto(r, SPLIT_FIELD_MAP));
    const dtosLedger = allLedger.map(r => ContractMapper.toDto(r, LEDGER_FIELD_MAP));

    const detailsByMaster = this.groupBy(dtosDetails, ["masterId"]);
    const splitsByContract = this.groupBy(dtosSplits, ["contractId"]);
    const ledgerByContract = this.groupBy(dtosLedger, ["contractId"]);

    const hydratedContractsCollection = [];

    dtosMasters.forEach(dtoMaster => {
      const mId = dtoMaster.masterId;
      const detailsForMaster = detailsByMaster[mId] || [];

      const master = new MasterContract({
        ...dtoMaster,
        billingChannel: dtoMaster.billingChannel || (detailsForMaster.length > 0 ? detailsForMaster[0].billingChannel : "")
      });

      detailsForMaster.forEach(dtoDetail => {
        const contract = new Contract(dtoDetail);

        const linkedLedger = ledgerByContract[contract.id] || [];
        linkedLedger.forEach(dtoL => contract.ledger.push(new LedgerMovement(dtoL)));

        const linkedSplits = splitsByContract[contract.id] || [];
        linkedSplits.forEach(dtoS => contract.splits.push(new AllocationSplit(dtoS)));

        master.addChild(contract);
        hydratedContractsCollection.push(contract);
      });
    });

    return hydratedContractsCollection;
  }
}

// Global Singleton Export
const ContractDomain = new ContractService();