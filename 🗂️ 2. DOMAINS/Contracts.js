/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: CONTRACTS DOMAIN (BULK OOP + TOP-DOWN LOOKUP)
 * ============================================================================
 * Gestisce l'intero ciclo di vita dei contratti attivi, dei master agreements,
 * delle regole di allocazione dei costi (Splits) e dei flussi reali (Ledger).
 * ============================================================================
 */

// ============================================================================
// 1. DOMAIN ENTITIES (Oggetti di Dominio Intelligenti)
// ============================================================================

class LedgerMovement {
  constructor(rawData, parentContractId) {
    this.contractId = parentContractId || rawData.contractId || rawData["Contract ID"] || "";
    this.startDate = rawData.startDate || rawData["Start Date"] ? new Date(rawData.startDate || rawData["Start Date"]) : null;
    this.endDate = rawData.endDate || rawData["End Date"] ? new Date(rawData.endDate || rawData["End Date"]) : null;
    this.type = String(rawData.type || rawData["Type"] || "ACTUAL").toUpperCase();
    this.amount = parseFloat(rawData.amount || rawData["Amount"]) || 0;
    this.notes = rawData.notes || rawData["Notes"] || "";
    this._raw = rawData;
  }

  isForecast() { return this.type === "FORECAST"; }
  isActual() { return this.type === "ACTUAL"; }

  exportToData() {
    return {
      "Contract ID": this.contractId,
      "Start Date": formatServerDate(this.startDate),
      "End Date": formatServerDate(this.endDate),
      "Type": this.type,
      "Amount": this.amount,
      "Notes": this.notes
    };
  }
}

class AllocationSplit {
  constructor(rawData, parentContractId) {
    this.splitId = rawData.splitId || rawData["Split ID"] || "SPL-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    this.contractId = parentContractId || rawData.contractId || rawData["Contract ID"] || "";
    this.targetLegalEntity = rawData.targetLegalEntity || rawData["Target Legal Entity"] || "";
    this.targetCostCenter = rawData.targetCostCenter || rawData["Target Cost Center"] || "";
    this.allocationRule = rawData.allocationRule || rawData["Allocation Rule"] || "Percentage";
    
    this.percentageShare = rawData.percentageShare !== undefined ? rawData.percentageShare : rawData["Percentage Share"];
    this.fixedAmount = parseFloat(rawData.fixedAmount || rawData["Fixed Amount"]) || 0;
    this.unitsAssigned = parseFloat(rawData.unitsAssigned || rawData["Units Assigned"]) || 0;
    
    this.validFrom = rawData.validFrom || rawData["Valid From"] ? new Date(rawData.validFrom || rawData["Valid From"]) : null;
    this.validTo = rawData.validTo || rawData["Valid To"] ? new Date(rawData.validTo || rawData["Valid To"]) : null;
    this.notes = rawData.notes || rawData["Notes"] || "";
    this._raw = rawData;
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
      ...this._raw,
      "Split ID": this.splitId,
      "Contract ID": this.contractId,
      "Target Legal Entity": this.targetLegalEntity,
      "Target Cost Center": this.targetCostCenter,
      "Allocation Rule": this.allocationRule,
      "Percentage Share": outPct,
      "Fixed Amount": this.allocationRule === "Fixed Amount" ? this.fixedAmount : "",
      "Units Assigned": this.allocationRule === "Units" ? this.unitsAssigned : "",
      "Valid From": formatServerDate(this.validFrom),
      "Valid To": formatServerDate(this.validTo),
      "Notes": this.notes
    };
  }
}

class Contract {
  constructor(data = {}) {
    this.id = data.id || "";
    this.masterId = data.masterId || "";
    
    // Date native vive
    this.startDate = data.startDate ? new Date(data.startDate) : null;
    this.contractEndDate = data.contractEndDate ? new Date(data.contractEndDate) : null;
    this.terminationDate = data.terminationDate ? new Date(data.terminationDate) : null;
    
    // Stringhe e Modelli
    this.costRecurrence = data.costRecurrence || "Recurrent";
    this.pricingModel = data.pricingModel || "Flat";
    this.billingTerms = data.billingTerms || "Linear";
    
    // Valori Numerici Puri
    this.totalCommitment = parseFloat(data.totalCommitment) || 0;
    this.annualValue = parseFloat(data.annualValue) || 0;
    
    this.ledger = [];
    this.splits = [];
  }

  getEndDate() {
    return (this.adjustedEndDate && !isNaN(this.adjustedEndDate.getTime())) ? this.adjustedEndDate : this.contractEndDate;
  }

  // Metodo helper privato ERP per estrarre le frazioni esatte di mese
  _getExactMonths(s, e) {
    if (!s || !e || s > e) return 0;
    const startDaysInMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
    const endDaysInMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
    
    // Se è tutto nello stesso mese
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
    const dataOut = {};
    for (let key in CONTRACT_FIELD_MAP) {
      const prop = CONTRACT_FIELD_MAP[key];
      if (this[prop] !== undefined) {
        dataOut[prop] = this[prop];
      } else if (this._raw[prop] !== undefined) {
        dataOut[prop] = this._raw[prop];
      } else if (this._raw[key] !== undefined) {
        dataOut[prop] = this._raw[key]; 
      } else {
        dataOut[prop] = "";
      }
    }
    
    dataOut.contractId = this.id;
    
    // Sicurezza Top-Down: 
    // Sovrascriviamo l'anagrafe SOLO SE il contratto è stato adottato da un Master (addChild)
    // Se è isolato o orfano, preserviamo i dati originali appena estratti dal dizionario.
    if (this.masterId !== undefined) dataOut.masterId = this.masterId;
    if (this.assetName !== undefined) dataOut.assetName = this.assetName;
    if (this.supplier !== undefined) dataOut.supplier = this.supplier;
    if (this.billingChannel !== undefined) dataOut.billingChannel = this.billingChannel;
    
    dataOut.endDate = formatServerDate(this.getEndDate());
    dataOut.contractTerm = this.getDurationMonths();
    dataOut.effectiveCommitment = this.getEffectiveCommitment();
    dataOut.annualValue = this.getAnnualValue();
    dataOut.status = this.calculateStatus();
    
    return dataOut;
  }

  generateForecastLedger() {
    const pm = String(this.pricingModel).toUpperCase().trim();
    const bt = String(this.billingTerms).toUpperCase().trim();
    
    // BUSINESS RULE 1: Auto-forecast abilitato SOLO per Minimum e Capped Consumption
    const isForecastable = pm === "MINIMUM CONSUMPTION" || pm === "CAPPED CONSUMPTION";
    if (!isForecastable) return [];
    
    // BUSINESS RULE 2: Se è Full Upfront o Ledger-Driven, non si autogenera nulla
    if (bt === "FULL UPFRONT" || bt === "LEDGER-DRIVEN") return [];
    
    if (this.costRecurrence === "One-Shot" || !this.startDate || !this.getEndDate()) return [];
    
    const movements = [];
    const finalEnd = this.getEndDate();
    let currentCursor = new Date(this.startDate.getTime());
    
    // Configurazione dinamica del passo temporale e dell'importo in base al Billing Terms
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
      
      // Calcoliamo la fine del periodo (es: +1 mese -1 giorno per mensile, +3 mesi -1 giorno per trimestrale)
      const chunkEnd = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + stepMonths, 0);
      const actualEnd = chunkEnd > finalEnd ? finalEnd : chunkEnd;
      
      movements.push(new LedgerMovement({
        "Contract ID": this.id,
        "Start Date": formatServerDate(chunkStart),
        "End Date": formatServerDate(actualEnd),
        "Type": "CALCULATED",
        "Amount": parseFloat(periodAmount.toFixed(2)),
        "Notes": `Engine-generated forecast (${labelType}) starting ${chunkStart.toLocaleString('default', { month: 'short' })} ${chunkStart.getFullYear()}`
      }, this.id));
      
      // Spostiamo in avanti il cursore del numero esatto di mesi previsti dal termine di fatturazione
      currentCursor = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + stepMonths, 1);
    }
    
    return movements;
  }

  exportFullLedger() {
    const pm = String(this.pricingModel).toUpperCase().trim();
    const bt = String(this.billingTerms).toUpperCase().trim();

    const isConsumption = pm.includes("CONSUMPTION");
    const isLedgerDriven = bt === "LEDGER-DRIVEN";

    // BUSINESS RULE 2: Se è Flat (e non ha un vincolo Ledger-Driven esplicito), VAPORIZZA il Ledger.
    if (!isConsumption && !isLedgerDriven) return [];

    const fullLedger = [];
    
    // 1. Preserva storici (Actual) perché il modello lo consente
    this.ledger.forEach(l => fullLedger.push(l.exportToData()));
    
    // 2. Accoda eventuali Forecast (che il metodo sopra genererà o meno in base alla regola)
    const generatedForecasts = this.generateForecastLedger();
    generatedForecasts.forEach(f => fullLedger.push(f.exportToData()));
    
    return fullLedger;
  }
}

class MasterContract {
  constructor(rawData) {
    this.id = rawData.masterId || rawData["Master Contract ID"] || "";
    this.supplier = rawData.supplier || rawData["Supplier"] || "";
    
    // Acquisizione campi per Top-Down Lookup
    this.assetName = rawData.assetName || rawData["Asset Name"] || "";
    this.billingChannel = rawData.billingChannel || rawData["Billing Channel"] || "";
    
    this.childContracts = [];
    this._raw = rawData;
  }

  addChild(contractInstance) {
    // ENFORCEMENT LOOKUP TOP-DOWN: Il Master è Re! Sovrascrive istantaneamente i campi anagrafici del figlio.
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
      const initStatus = String(init["Initiative Status"] || "").toUpperCase();
      const decision = String(init["Decision"] || "").toUpperCase();
      if (initStatus === "COMPLETED" && ["TERMINATE", "REPLACE", "TRANSFER"].includes(decision)) checkTerminated++;
      if (initStatus === "IN PROGRESS") checkNegotiation++;
    });

    if (checkTerminated > 0) return "TERMINATED";
    if (hasActiveChilds) return "ACTIVE";
    if (checkNegotiation > 0) return "IN NEGOTIATION";
    return "EXPIRED";
  }

  exportToData(linkedInitiatives) {
    const dataOut = {};
    for (let key in MASTER_FIELD_MAP) {
      const prop = MASTER_FIELD_MAP[key];
      if (this[prop] !== undefined) {
        dataOut[prop] = this[prop];
      } else if (this._raw[prop] !== undefined) {
        dataOut[prop] = this._raw[prop];
      } else if (this._raw[key] !== undefined) {
        dataOut[prop] = this._raw[key]; 
      } else {
        dataOut[prop] = "";
      }
    }
    
    dataOut.masterId = this.id;
    dataOut.supplier = this.supplier;
    dataOut.assetName = this.assetName;
    dataOut.billingChannel = this.billingChannel;
    
    dataOut.masterStartDate = formatServerDate(this.getMinStartDate());
    dataOut.masterEndDate = formatServerDate(this.getMaxEndDate());
    dataOut.totalCommitment = this.getTotalCommitment();
    dataOut.runRate = this.getRunRate();
    dataOut.status = this.deriveStatus(linkedInitiatives);
    
    return dataOut;
  }
}

// ============================================================================
// 2. DATA ACCESS LAYER (REPOSITORY) - BULK O(1) OVERWRITE
// ============================================================================

class ContractRepository {

  saveMasterRow(masterData) {
    const ctx = getSheetContext(CONFIG.SHEETS.MASTER_CONTRACTS);
    const idCol = ctx.headers.indexOf("Master Contract ID");
    let rowIdx = -1;
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][idCol]).trim() === String(masterData.masterId).trim()) { rowIdx = i + 1; break; }
    }
    if (rowIdx > 0) { updateRowSafe(ctx.sheet, rowIdx, ctx.headers, masterData, EDITABLE_MASTER, MASTER_FIELD_MAP); } 
    else {
      let newRow = new Array(ctx.headers.length).fill("");
      newRow[idCol] = masterData.masterId;
      ctx.sheet.appendRow(newRow);
      updateRowSafe(ctx.sheet, ctx.sheet.getLastRow(), ctx.headers, masterData, EDITABLE_MASTER, MASTER_FIELD_MAP);
    }
  }

  saveDetailsCollection(masterId, detailsDataArray) {
    const ctx = getSheetContext(CONFIG.SHEETS.CONTRACTS);
    const mIdCol = ctx.headers.indexOf("Master Contract ID");
    const cIdCol = ctx.headers.indexOf("Contract ID");
    
    const dbRowsMap = new Map();
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][mIdCol]).trim() === String(masterId).trim()) { dbRowsMap.set(String(ctx.data[i][cIdCol]).trim(), i + 1); }
    }
    detailsDataArray.forEach(detail => {
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

  wipeAndWriteSplits(contractIds, splitsDataArray) {
    if (contractIds.length === 0) return;
    const ctx = getSheetContext(CONFIG.SHEETS.ALLOCATION_SPLITS);
    if (!ctx.sheet) return;
    const cIdCol = ctx.headers.indexOf("Contract ID");
    for (let i = ctx.data.length - 1; i >= 1; i--) {
      if (contractIds.includes(String(ctx.data[i][cIdCol]).trim())) ctx.sheet.deleteRow(i + 1);
    }
    if (splitsDataArray.length === 0) return;
    const rows = splitsDataArray.map(s => [s["Split ID"], s["Contract ID"], s["Target Legal Entity"], s["Target Cost Center"], s["Allocation Rule"], s["Percentage Share"], s["Fixed Amount"], s["Units Assigned"], s["Valid From"], s["Valid To"], s["Notes"]]);
    ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  wipeAndWriteLedger(contractIds, ledgerDataArray) {
    if (contractIds.length === 0) return;
    const ctx = getSheetContext(CONFIG.SHEETS.LEDGER);
    if (!ctx.sheet) return;
    const cIdCol = ctx.headers.indexOf("Contract ID");
    for (let i = ctx.data.length - 1; i >= 1; i--) {
      if (contractIds.includes(String(ctx.data[i][cIdCol]).trim())) ctx.sheet.deleteRow(i + 1);
    }
    if (ledgerDataArray.length === 0) return;
    const rows = ledgerDataArray.map(l => [l["Contract ID"], l["Start Date"], l["End Date"], l["Type"], l["Amount"], l["Notes"]]);
    ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  // OVERWRITE DI MASSA (USATO DAI BATCH)
  overwriteAllMasters(mastersArray) {
    this._bulkOverwrite(CONFIG.SHEETS.MASTER_CONTRACTS, mastersArray, MASTER_FIELD_MAP);
  }
  overwriteAllContracts(contractsArray) {
    this._bulkOverwrite(CONFIG.SHEETS.CONTRACTS, contractsArray, CONTRACT_FIELD_MAP);
  }
  overwriteAllSplits(splitsArray) {
    this._bulkOverwrite(CONFIG.SHEETS.ALLOCATION_SPLITS, splitsArray, null);
  }
  overwriteAllLedger(ledgerArray) {
    this._bulkOverwrite(CONFIG.SHEETS.LEDGER, ledgerArray, null);
  }

  _bulkOverwrite(sheetName, dataObjectsArray, fieldMap) {
    const ctx = getSheetContext(sheetName);
    if (!ctx.sheet) return;
    if (ctx.sheet.getLastRow() > 1) {
      ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.headers.length).clearContent();
    }
    if (dataObjectsArray.length === 0) return;
    
    const rows = dataObjectsArray.map(obj => {
      return ctx.headers.map(header => {
        if (fieldMap && fieldMap[header]) {
          const prop = fieldMap[header];
          return obj[prop] !== undefined ? obj[prop] : "";
        }
        return obj[header] !== undefined ? obj[header] : "";
      });
    });
    
    ctx.sheet.getRange(2, 1, rows.length, ctx.headers.length).setValues(rows);
  }
}

// ============================================================================
// 3. BUSINESS LOGIC LAYER (SERVICE)
// ============================================================================

// ============================================================================
// 3. BUSINESS LOGIC LAYER (SERVICE)
// ============================================================================

// ============================================================================
// 3. BUSINESS LOGIC LAYER (SERVICE) - HASH MAP OPTIMIZED
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

  /**
   * PERFORMANCE FIX: Crea un Hash Map O(1) per evitare i cicli annidati (O(N^2)).
   * Accetta un array di "chiavi possibili" per gestire sia le intestazioni del foglio che le proprietà dell'oggetto.
   */
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
    console.log("CONTRACT DOMAIN: Fabbricazione oggetti di dominio ed elaborazione...");
    
    const master = new MasterContract({
      ...payload,
      assetName: payload.assetName,
      supplier: payload.supplier,
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

    payload.details.forEach(rawDetail => {
      const contract = new Contract(rawDetail);
      if (rawDetail.ledger && Array.isArray(rawDetail.ledger)) {
        rawDetail.ledger.forEach(l => contract.ledger.push(new LedgerMovement(l, contract.id)));
      }
      if (rawDetail.splits && Array.isArray(rawDetail.splits)) {
        rawDetail.splits.forEach(s => contract.splits.push(new AllocationSplit(s, contract.id)));
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

    // ========================================================================
    // CREAZIONE DEGLI INDICI O(1) (Il segreto della velocità)
    // ========================================================================
    const detailsByMaster = this.groupBy(allDetails, ["Master Contract ID", "masterId"]);
    const splitsByContract = this.groupBy(allSplits, ["Contract ID", "contractId"]);
    const ledgerByContract = this.groupBy(allLedger, ["Contract ID", "contractId"]);
    const initsByMaster = this.groupBy(allInits, ["Master Contract ID", "masterId"]);

    let finalMasters = [];
    let finalDetails = [];
    let finalSplits = [];
    let finalLedger = [];
    
    let globalSupplierCount = allDetails.length;

    allMasters.forEach(m => {
      const mId = String(m["Master Contract ID"] || m.masterId).trim();
      
      // PESCAGGIO ISTANTANEO (Zero cicli .filter() annidati!)
      const rawDetailsForMaster = detailsByMaster[mId] || [];
      const masterInits = initsByMaster[mId] || [];
      
      const detailsPayload = rawDetailsForMaster.map(d => {
        const cId = String(d["Contract ID"] || d.contractId).trim();
        return {
          ...d,
          contractId: cId,
          masterId: mId,
          splits: splitsByContract[cId] || [], // Accesso diretto in O(1)
          ledger: ledgerByContract[cId] || []  // Accesso diretto in O(1)
        };
      });

      const singlePayload = {
        ...m,
        masterId: mId,
        supplier: m["Supplier"] || m.supplier,
        assetName: m["Asset Name"] || m.assetName || (rawDetailsForMaster.length > 0 ? (rawDetailsForMaster[0]["Asset Name"] || rawDetailsForMaster[0].assetName) : "GENERIC"),
        billingChannel: m["Billing Channel"] || m.billingChannel || (rawDetailsForMaster.length > 0 ? (rawDetailsForMaster[0]["Billing Channel"] || rawDetailsForMaster[0].billingChannel) : ""),
        details: detailsPayload,
        initiatives: masterInits
      };

      const master = new MasterContract(singlePayload);
      
      singlePayload.details.forEach(rawDetail => {
        const contract = new Contract(rawDetail);
        if (rawDetail.ledger && Array.isArray(rawDetail.ledger)) {
          rawDetail.ledger.forEach(l => contract.ledger.push(new LedgerMovement(l, contract.id)));
        }
        if (rawDetail.splits && Array.isArray(rawDetail.splits)) {
          rawDetail.splits.forEach(s => contract.splits.push(new AllocationSplit(s, contract.id)));
        }
        contract.validateIntegrity();
        master.addChild(contract);
      });

      if (!master.id) {
        const mCount = finalMasters.filter(fm => String(fm.supplier).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
        const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
        master.id = this.generateId("MCT", master.supplier, singlePayload.assetName, mYear, mCount);
      }

      master.childContracts.forEach(c => {
        if (!c.id) {
          globalSupplierCount++;
          const cYear = c.startDate ? c.startDate.getFullYear() : new Date().getFullYear();
          c.id = this.generateId("CTR", master.supplier, singlePayload.assetName, cYear, globalSupplierCount);
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
}

// Global Singleton Export
const ContractDomain = new ContractService();
