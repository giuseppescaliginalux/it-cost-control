/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: CONTRACTS DOMAIN (PURE OOP)
 * ============================================================================
 * Gestisce l'intero ciclo di vita dei contratti attivi, dei master agreements,
 * delle regole di allocazione dei costi (Splits) e dei flussi reali (Ledger).
 * ============================================================================
 */

// ============================================================================
// 1. DOMAIN ENTITIES (Oggetti di Dominio Intelligenti)
// ============================================================================

/**
 * @class LedgerMovement
 * @description Rappresenta una singola riga di transazione reale o stimata (Actual/Forecast).
 */
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

/**
 * @class AllocationSplit
 * @description Entità di validazione e calcolo delle regole di scomposizione dei costi sui Cost Center.
 */
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
  }

  isPercentage() { return this.allocationRule === "Percentage"; }

  getRawPercentage() {
    if (!this.isPercentage() || this.percentageShare === "") return 0;
    return parseFloat(this.percentageShare);
  }

  exportToData() {
    return {
      "Split ID": this.splitId,
      "Contract ID": this.contractId,
      "Target Legal Entity": this.targetLegalEntity,
      "Target Cost Center": this.targetCostCenter,
      "Allocation Rule": this.allocationRule,
      "Percentage Share": this.isPercentage() && this.percentageShare !== "" ? (parseFloat(this.percentageShare) / 100) : "",
      "Fixed Amount": this.allocationRule === "Fixed Amount" ? this.fixedAmount : "",
      "Units Assigned": this.allocationRule === "Units" ? this.unitsAssigned : "",
      "Valid From": formatServerDate(this.validFrom),
      "Valid To": formatServerDate(this.validTo),
      "Notes": this.notes
    };
  }
}

/**
 * @class Contract
 * @description Entità fulcro. Sa calcolare autonomamente le proprie metriche finanziarie pro-rata e lo status.
 */
class Contract {
  constructor(rawData) {
    this.id = rawData.contractId || rawData["Contract ID"] || "";
    this.masterId = rawData.masterId || rawData["Master Contract ID"] || "";
    this.costRecurrence = rawData.costRecurrence || rawData["Cost Recurrence"] || "Recurrent";
    this.totalCommitment = parseFloat(rawData.totalCommitment !== undefined ? rawData.totalCommitment : rawData["Total Commitment"]) || 0;
    
    this.startDate = rawData.startDate || rawData["Start Date"] ? new Date(rawData.startDate || rawData["Start Date"]) : null;
    this.contractEndDate = rawData.contractEndDate || rawData["Contract End Date"] ? new Date(rawData.contractEndDate || rawData["Contract End Date"]) : null;
    this.adjustedEndDate = rawData.adjustedEndDate || rawData["Adjusted End Date"] ? new Date(rawData.adjustedEndDate || rawData["Adjusted End Date"]) : null;
    
    // Composizione OOP: Il contratto detiene e governa i suoi split e ledger
    this.splits = [];
    this.ledger = [];
    this._raw = rawData;
  }

  getEndDate() {
    return (this.adjustedEndDate && !isNaN(this.adjustedEndDate.getTime())) ? this.adjustedEndDate : this.contractEndDate;
  }

  getDurationMonths() {
    if (!this.startDate || !this.getEndDate()) return 0;
    const days = Math.round((this.getEndDate() - this.startDate) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(0, Math.round(days / 30.4166));
  }

  getEffectiveCommitment() {
    if (this.costRecurrence === "One-Shot") return this.totalCommitment;
    if (!this.startDate || !this.contractEndDate || !this.getEndDate()) return 0;
    
    const origDays = Math.round((this.contractEndDate - this.startDate) / (1000 * 60 * 60 * 24)) + 1;
    const actDays = Math.round((this.getEndDate() - this.startDate) / (1000 * 60 * 60 * 24)) + 1;
    return parseFloat((this.totalCommitment * (actDays / (origDays || 1))).toFixed(2));
  }

  getAnnualValue() {
    if (this.costRecurrence === "One-Shot") return parseFloat(this.totalCommitment.toFixed(2));
    if (!this.startDate || !this.contractEndDate) return 0;
    
    const origDays = Math.round((this.contractEndDate - this.startDate) / (1000 * 60 * 60 * 24)) + 1;
    const origMonths = Math.max(1, Math.round(origDays / 30.4166));
    return parseFloat(((this.totalCommitment / origMonths) * 12).toFixed(2));
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
    // Regola SOLID di Auto-Validazione: Controlla la coerenza aritmetica degli split percentuali
    const pctSplits = this.splits.filter(s => s.isPercentage());
    if (pctSplits.length > 0) {
      const totalPct = pctSplits.reduce((sum, s) => sum + s.getRawPercentage(), 0);
      if (totalPct > 100.001) { // Tolleranza floating point minimale
        throw new Error(`Polity Violation: Gli split del contratto ${this.id} ammontano al ${totalPct}%, superando il 100%.`);
      }
    }
  }

  exportToData() {
    // Mantiene l'accoppiamento speculare con l'infrastruttura di visualizzazione esistente
    const dataOut = {};
    for (let key in CONTRACT_FIELD_MAP) {
      const prop = CONTRACT_FIELD_MAP[key];
      dataOut[prop] = this._raw[prop] !== undefined ? this._raw[prop] : "";
    }
    
    // Inietta i campi calcolati in tempo reale dall'oggetto
    dataOut.contractId = this.id;
    dataOut.masterId = this.masterId;
    dataOut.endDate = formatServerDate(this.getEndDate());
    dataOut.contractTerm = this.getDurationMonths();
    dataOut.effectiveCommitment = this.getEffectiveCommitment();
    dataOut.annualValue = this.getAnnualValue();
    dataOut.status = this.calculateStatus();
    
    return dataOut;
  }

  /**
   * LEDGER ENGINE INTEGRATO: Genera le righe di Forecast mensili pro-rata 
   * per tutta la durata del contratto.
   * @returns {Array<LedgerMovement>}
   */
  generateForecastLedger() {
    if (this.costRecurrence === "One-Shot" || !this.startDate || !this.getEndDate()) return [];
    
    const movements = [];
    const monthlyAmount = this.getAnnualValue() / 12;
    
    let currentCursor = new Date(this.startDate.getTime());
    const finalEnd = this.getEndDate();
    
    // Cicla mese per mese fino alla fine del contratto
    while (currentCursor <= finalEnd) {
      const chunkStart = new Date(currentCursor.getTime());
      
      // Calcola la fine del mese corrente
      const chunkEnd = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + 1, 0);
      const actualEnd = chunkEnd > finalEnd ? finalEnd : chunkEnd;
      
      movements.push(new LedgerMovement({
        "Contract ID": this.id,
        "Start Date": formatServerDate(chunkStart),
        "End Date": formatServerDate(actualEnd),
        "Type": "FORECAST",
        "Amount": parseFloat(monthlyAmount.toFixed(2)),
        "Notes": `Autogenerated Forecast for ${chunkStart.toLocaleString('default', { month: 'long' })} ${chunkStart.getFullYear()}`
      }, this.id));
      
      // Avanza al primo giorno del mese successivo
      currentCursor = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + 1, 1);
    }
    
    return movements;
  }
}

/**
 * @class MasterContract
 * @description Root Aggregate. Incapsula i contratti figli e ne aggrega dinamicamente le metriche.
 */
class MasterContract {
  constructor(rawData) {
    this.id = rawData.masterId || rawData["Master Contract ID"] || "";
    this.supplier = rawData.supplier || rawData["Supplier"] || "";
    this.childContracts = [];
    this._raw = rawData;
  }

  addChild(contractInstance) {
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
      dataOut[prop] = this._raw[prop] !== undefined ? this._raw[prop] : "";
    }
    
    dataOut.masterId = this.id;
    dataOut.supplier = this.supplier;
    dataOut.masterStartDate = formatServerDate(this.getMinStartDate());
    dataOut.masterEndDate = formatServerDate(this.getMaxEndDate());
    dataOut.totalCommitment = this.getTotalCommitment();
    dataOut.runRate = this.getRunRate();
    dataOut.status = this.deriveStatus(linkedInitiatives);
    
    return dataOut;
  }
}

// ============================================================================
// 2. DATA ACCESS LAYER (REPOSITORY)
// ============================================================================

/**
 * @class ContractRepository
 * @description Gestore atomico ed unico dell'I/O relazionale dei contratti su Google Sheets.
 */
class ContractRepository {
  
  saveMasterRow(masterData) {
    const ctx = getSheetContext(CONFIG.SHEETS.MASTER_CONTRACTS);
    const idCol = ctx.headers.indexOf("Master Contract ID");
    let rowIdx = -1;
    
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][idCol]).trim() === String(masterData.masterId).trim()) {
        rowIdx = i + 1;
        break;
      }
    }
    
    if (rowIdx > 0) {
      updateRowSafe(ctx.sheet, rowIdx, ctx.headers, masterData, EDITABLE_MASTER, MASTER_FIELD_MAP);
    } else {
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
      if (String(ctx.data[i][mIdCol]).trim() === String(masterId).trim()) {
        dbRowsMap.set(String(ctx.data[i][cIdCol]).trim(), i + 1);
      }
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
    
    // Rimozione righe cancellate orfane (Ordinamento invertito per preservare gli indici)
    const toDelete = Array.from(dbRowsMap.values()).sort((a, b) => b - a);
    toDelete.forEach(idx => ctx.sheet.deleteRow(idx));
  }

  wipeAndWriteSplits(contractIds, splitsDataArray) {
    if (contractIds.length === 0) return;
    const ctx = getSheetContext(CONFIG.SHEETS.ALLOCATION_SPLITS);
    if (!ctx.sheet) return;
    
    const cIdCol = ctx.headers.indexOf("Contract ID");
    for (let i = ctx.data.length - 1; i >= 1; i--) {
      if (contractIds.includes(String(ctx.data[i][cIdCol]).trim())) {
        ctx.sheet.deleteRow(i + 1);
      }
    }
    
    if (splitsDataArray.length === 0) return;
    const rows = splitsDataArray.map(s => [
      s["Split ID"], s["Contract ID"], s["Target Legal Entity"], s["Target Cost Center"],
      s["Allocation Rule"], s["Percentage Share"], s["Fixed Amount"], s["Units Assigned"],
      s["Valid From"], s["Valid To"], s["Notes"]
    ]);
    ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  wipeAndWriteLedger(contractIds, ledgerDataArray) {
    if (contractIds.length === 0) return;
    const ctx = getSheetContext(CONFIG.SHEETS.LEDGER);
    if (!ctx.sheet) return;
    
    const cIdCol = ctx.headers.indexOf("Contract ID");
    for (let i = ctx.data.length - 1; i >= 1; i--) {
      if (contractIds.includes(String(ctx.data[i][cIdCol]).trim())) {
        ctx.sheet.deleteRow(i + 1);
      }
    }
    
    if (ledgerDataArray.length === 0) return;
    const rows = ledgerDataArray.map(l => [
      l["Contract ID"], l["Start Date"], l["End Date"], l["Type"], l["Amount"], l["Notes"]
    ]);
    ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// ============================================================================
// 3. BUSINESS LOGIC LAYER (SERVICE)
// ============================================================================

/**
 * @class ContractService
 * @description Orchestratore di Dominio. Costruisce l'albero a oggetti e gestisce la transazione.
 */
class ContractService {
  constructor() {
    this.repository = new ContractRepository();
  }

  /**
   * Genera un ID univoco standardizzato rimuovendo vocali, spazi, punti e VIRGOLE.
   */
  generateId(prefix, supplier, assetName, year, count) {
    // Aggiunta la virgola dentro la classe dei caratteri da rimuovere [aeiou.,\s]
    const cleanSupplier = String(supplier || "GEN").replace(/[aeiou.,\s]/gi, "").substring(0, 4).toUpperCase();
    const cleanAsset = String(assetName || "AST").replace(/[aeiou.,\s]/gi, "").substring(0, 4).toUpperCase();
    
    const padCount = count < 10 ? "0" + count : count;
    return `${prefix}-${cleanSupplier}-${cleanAsset}-${year}-${padCount}`;
  }

  processAndSync(payload) {
    console.log("CONTRACT DOMAIN: Fabbricazione oggetti di dominio ed elaborazione...");
    
    // 1. Creazione dell'Aggregate Root
    const master = new MasterContract(payload);
    
    // 2. Risoluzione dei contatori globali per la generazione ID stabili
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ctxContracts = getSheetContext(CONFIG.SHEETS.CONTRACTS);
    const supColIdx = ctxContracts.headers.indexOf("Supplier");
    let globalSupplierCount = 0;
    for (let i = 1; i < ctxContracts.data.length; i++) {
      if (String(ctxContracts.data[i][supColIdx]).toLowerCase().trim() === String(payload.supplier).toLowerCase().trim()) {
        globalSupplierCount++;
      }
    }

    // 3. Istanziazione e associazione dei contratti figli operativi
    payload.details.forEach(rawDetail => {
      const contract = new Contract(rawDetail);
      
      // Associazione Composita dei flussi Ledger
      if (rawDetail.ledger && Array.isArray(rawDetail.ledger)) {
        rawDetail.ledger.forEach(l => contract.ledger.push(new LedgerMovement(l, contract.id)));
      }
      
      // Associazione Composita degli Split
      if (rawDetail.splits && Array.isArray(rawDetail.splits)) {
        rawDetail.splits.forEach(s => contract.splits.push(new AllocationSplit(s, contract.id)));
      }
      
      // Auto-Validazione SOLID interna all'entità
      contract.validateIntegrity();
      master.addChild(contract);
    });

    // 4. Generazione ID latenti
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
        // Cascata dell'ID generato sulle sotto-entità dipendenti
        c.splits.forEach(s => s.contractId = c.id);
        c.ledger.forEach(l => l.contractId = c.id);
      }
      c.masterId = master.id;
    });

    // 5. Conversione degli oggetti in DTO puri (Serializzazione sicura per il Client ed Excel)
    const exportedMaster = master.exportToData(payload.initiatives || []);
    const exportedDetails = master.childContracts.map(c => c.exportToData());
    
    let exportedSplits = [];
    let exportedLedger = [];
    master.childContracts.forEach(c => {
      exportedSplits = exportedSplits.concat(c.splits.map(s => s.exportToData()));

      const generatedForecasts = c.generateForecastLedger();
      exportedLedger = exportedLedger.concat(generatedForecasts.map(f => f.exportToData()));
    });

    // 6. Persistenza atomica sul Data Layer
    const contractIds = master.childContracts.map(c => c.id);
    this.repository.saveMasterRow(exportedMaster);
    this.repository.saveDetailsCollection(master.id, exportedDetails);
    this.repository.wipeAndWriteSplits(contractIds, exportedSplits);
    this.repository.wipeAndWriteLedger(contractIds, exportedLedger);

    console.log(`CONTRACT DOMAIN: Sincronizzazione Master [${master.id}] completata.`);
    return "SUCCESS";
  }

  forceRecalculateAll() {
    console.log("CONTRACT DOMAIN: Avvio ricalcolo massivo forzato...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allDetails = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];
    const allSplits = getSheetDataAsObjects(ss, CONFIG.SHEETS.ALLOCATION_SPLITS) || [];
    const allLedger = getSheetDataAsObjects(ss, CONFIG.SHEETS.LEDGER) || [];

    allMasters.forEach(m => {
      const mId = String(m["Master Contract ID"] || m.masterId).trim();
      const rawDetailsForMaster = allDetails.filter(d => String(d["Master Contract ID"] || d.masterId).trim() === mId);
      
      const detailsPayload = rawDetailsForMaster.map(d => {
        const cId = String(d["Contract ID"] || d.contractId).trim();
        return {
          ...d,
          contractId: cId,
          masterId: mId,
          splits: allSplits.filter(s => String(s["Contract ID"] || s.contractId).trim() === cId),
          ledger: allLedger.filter(l => String(l["Contract ID"] || l.contractId).trim() === cId)
        };
      });

      const singlePayload = {
        ...m,
        masterId: mId,
        supplier: m["Supplier"] || m.supplier,
        assetName: rawDetailsForMaster.length > 0 ? (rawDetailsForMaster[0]["Asset Name"] || rawDetailsForMaster[0].assetName) : "GENERIC",
        details: detailsPayload,
        initiatives: getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES).filter(i => String(i["Master Contract ID"]).trim() === mId)
      };

      this.processAndSync(singlePayload);
    });
  }
}

// Global Singleton Export
const ContractDomain = new ContractService();