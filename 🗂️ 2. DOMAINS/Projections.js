/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: PROJECTIONS DOMAIN (PURE DTO PATTERN)
 * ============================================================================
 */

// ============================================================================
// 1. INFRASTRUCTURE & PERSISTENCE SCHEMA
// ============================================================================
const PROJECTION_FIELD_MAP = {
  "Contract ID": "contractId", "Asset Name": "assetName", "Status": "status",
  "Annual Value": "annualValue", "Start Date": "startDate", "End Date": "endDate",
  "Supplier": "supplier", "Legal Entity": "legalEntity", "Expenditure Type": "expenditureType",
  "FY26 Baseline": "fy26Baseline", "FY26 Optimized": "fy26Optimized",
  "FY27 Baseline": "fy27Baseline", "FY27 Optimized": "fy27Optimized",
  "FY28 Baseline": "fy28Baseline", "FY28 Optimized": "fy28Optimized"
};

const ProjectionMapper = {
  toDto: (rawRow) => {
    const dto = {};
    const mappedKeys = Object.keys(PROJECTION_FIELD_MAP);
    const mappedCamelKeys = Object.values(PROJECTION_FIELD_MAP);
    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) dto[key] = rawRow[key];
    }
    for (let sheetHeader in PROJECTION_FIELD_MAP) {
      const camelProp = PROJECTION_FIELD_MAP[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }
    return dto;
  }
};

// ============================================================================
// 2. PURE MODEL DOMAIN ENTITY
// ============================================================================
class TimePeriod {
  constructor(name, startDateStr, endDateStr) {
    this.name = name;
    this.startDate = new Date(startDateStr);
    this.endDate = new Date(endDateStr);
  }
  getOverlapDays(contractStart, effectiveEnd) {
    if (!contractStart || !effectiveEnd) return 0;
    const start = new Date(Math.max(this.startDate, contractStart));
    const end = new Date(Math.min(this.endDate, effectiveEnd));
    if (start > end) return 0;
    return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }
}

class ContractProjection {
  constructor(contractDto, period, linkedInitiatives = [], successorStartDate = null) {
    this.contract = contractDto;
    this.period = period;
    this.linkedInitiatives = linkedInitiatives;
    
    this.contractStart = contractDto.startDate ? new Date(contractDto.startDate) : null;
    this.contractEnd = contractDto.contractEndDate || contractDto.endDate ? new Date(contractDto.contractEndDate || contractDto.endDate) : null;
    
    const isRecurrent = String(contractDto.costRecurrence).toLowerCase() === "recurrent";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isHistoricallyExpired = this.contractEnd && this.contractEnd < today;
    
    if (successorStartDate) {
        this.effectiveEndDate = new Date(successorStartDate);
        this.effectiveEndDate.setDate(this.effectiveEndDate.getDate() - 1);
    } else if (isRecurrent && !isHistoricallyExpired) {
        this.effectiveEndDate = new Date(2099, 11, 31);
    } else {
        this.effectiveEndDate = this.contractEnd;
    }
    
    this.daysOfCompetence = this.period ? this.period.getOverlapDays(this.contractStart, this.effectiveEndDate) : 0;
  }

  calculateBaseline() {
    if (this.daysOfCompetence <= 0) return 0;
    if (this.contract.costRecurrence === "One-Shot") {
      if (this.contractStart >= this.period.startDate && this.contractStart <= this.period.endDate) {
        return parseFloat(this.contract.totalCommitment) || 0;
      }
      return 0;
    }

    const monthlyFlatRate = (parseFloat(this.contract.annualValue) || 0) / 12;
    let totalBaseline = 0;
    const startCursor = new Date(Math.max(this.period.startDate, this.contractStart));
    const endCursor = new Date(Math.min(this.period.endDate, this.effectiveEndDate));
    if (startCursor > endCursor) return 0;

    let current = new Date(startCursor);
    current.setDate(1);

    while (current <= endCursor) {
      let monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      let monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      let overlapStart = monthStart < startCursor ? startCursor : monthStart;
      let overlapEnd = monthEnd > endCursor ? endCursor : monthEnd;

      if (overlapStart <= overlapEnd) {
        let activeDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        let daysInMonth = Math.round((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
        if (activeDays === daysInMonth) totalBaseline += monthlyFlatRate;
        else totalBaseline += monthlyFlatRate * (activeDays / daysInMonth);
      }
      current.setMonth(current.getMonth() + 1);
    }
    return parseFloat(totalBaseline.toFixed(2));
  }

  calculateOptimized() {
    if (this.daysOfCompetence <= 0) return 0;
    if (this.contract.costRecurrence === "One-Shot") return this.calculateBaseline();

    const activeInits = this.linkedInitiatives.filter(init => ["COMPLETED", "IN PROGRESS"].includes(String(init.status).toUpperCase()));
    if (activeInits.length === 0) return this.calculateBaseline();
    activeInits.sort((a, b) => a.getEffectiveDate() - b.getEffectiveDate());

    const monthlyFlatRate = (parseFloat(this.contract.annualValue) || 0) / 12;
    let totalOptimized = 0;
    const startCursor = new Date(Math.max(this.period.startDate, this.contractStart));
    const endCursor = new Date(Math.min(this.period.endDate, this.effectiveEndDate));
    if (startCursor > endCursor) return 0;

    let current = new Date(startCursor);
    current.setDate(1);

    while (current <= endCursor) {
      let monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      let monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      let overlapStart = monthStart < startCursor ? startCursor : monthStart;
      let overlapEnd = monthEnd > endCursor ? endCursor : monthEnd;

      if (overlapStart <= overlapEnd) {
        let daysInMonth = Math.round((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
        let dailyRateForMonth = monthlyFlatRate / daysInMonth;
        let dayCursor = new Date(overlapStart);
        
        while (dayCursor <= overlapEnd) {
          let dayRateModifier = 1.0;
          let isTerminated = false;
          
          for (let init of activeInits) {
            if (dayCursor >= init.getEffectiveDate()) {
              const strategy = String(init.decision).toUpperCase();
              if (["TERMINATE", "REPLACE", "TRANSFER"].includes(strategy)) {
                isTerminated = true; 
                break;
              } else {
                // ⚡ LOOKUP PRO-RATA BILANCIATO:
                // Troviamo il peso del contratto rispetto alla baseline dell'iniziativa (Run Rate del Master)
                const totalInitBaseline = parseFloat(init.baselineSpendAnnualized) || parseFloat(this.contract.annualValue) || 1;
                const contractWeight = (parseFloat(this.contract.annualValue) || 0) / totalInitBaseline;
                
                // Il tasso di risparmio dell'iniziativa viene pesato per questo specifico contratto
                const globalSavingPct = init.targetSavingPct > 1 ? init.targetSavingPct / 100 : init.targetSavingPct;
                const weightedSavingForThisContract = globalSavingPct * contractWeight;
                
                dayRateModifier = Math.max(0, dayRateModifier - weightedSavingForThisContract);
              }
            }
          }
          if (!isTerminated) totalOptimized += dailyRateForMonth * dayRateModifier;
          dayCursor.setDate(dayCursor.getDate() + 1);
        }
      }
      current.setMonth(current.getMonth() + 1);
    }
    return parseFloat(totalOptimized.toFixed(2));
  }
}

// ============================================================================
// 3. REPOSITORY & SERVICE
// ============================================================================
class ProjectionRepository {
  constructor() { this.sheetName = CONFIG.SHEETS.PROJECTIONS; }
  rewriteTable(matrixDtoObjects) {
    const ctx = getSheetContext(this.sheetName);
    if (!ctx.sheet) throw new Error("FiscalProjections infrastructure missing.");
    if (ctx.sheet.getLastRow() > 1) ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.headers.length).clearContent();
    if (matrixDtoObjects.length === 0) return;
    const rows = matrixDtoObjects.map(dto => ctx.headers.map(h => PROJECTION_FIELD_MAP[h] ? dto[PROJECTION_FIELD_MAP[h]] : (dto[h] !== undefined ? dto[h] : "")));
    ctx.sheet.getRange(2, 1, rows.length, ctx.headers.length).setValues(rows);
  }
}

class ProjectionService {
  constructor() {
    this.repository = new ProjectionRepository();
    this.fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
    this.fy27 = new TimePeriod("FY27", "2026-07-01", "2027-06-30");
    this.fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
  }

  recalculateAll() {
    console.log("PROJECTION DOMAIN: Generazione scenari fiscali orizzontali...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Chiediamo al dominio delle Iniziative i suoi oggetti puri
    const rawInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
    const domainInitiatives = rawInits.map(i => new Initiative(InitiativeMapper.toDto(i)));

    // 2. 🔥 REFACTOR: Chiediamo al dominio dei Contratti gli oggetti già pronti e idratati!
    // Addio letture dirette dei fogli dei contratti, addio accoppiamenti abusivi!
    const activeDomainContracts = ContractDomain.getHydratedContracts();

    // 3. Recuperiamo i Master estratti per la logica dei successori (ci servono i DTO grezzi dei master solo per i rollover virtuali)
    const rawMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const dtosMasters = rawMasters.map(m => ContractMapper.toDto(m, MASTER_FIELD_MAP));

    const outputRows = [];

    // 4. Cicliamo direttamente sulle istanze della classe Contract
    activeDomainContracts.forEach(contractInstance => {
      const mId = String(contractInstance.masterId).trim();
      const linkedInits = domainInitiatives.filter(init => String(init.masterId).trim() === mId);

      const successorMaster = dtosMasters.find(m => {
          const prevs = String(m.previousMasterId || "").split(',').map(s => s.trim()).filter(s => s);
          return prevs.includes(mId);
      });
      
      let successorStart = null;
      if (successorMaster && successorMaster.masterStartDate) {
          successorStart = new Date(successorMaster.masterStartDate);
      }

      // Convertiamo l'oggetto in formato DTO flat compatibile con la classe di proiezione
      const contractDtoFlat = contractInstance.exportToData();

      const proj26 = new ContractProjection(contractDtoFlat, this.fy26, linkedInits, successorStart);
      const proj27 = new ContractProjection(contractDtoFlat, this.fy27, linkedInits, successorStart);
      const proj28 = new ContractProjection(contractDtoFlat, this.fy28, linkedInits, successorStart);

      const rowDto = {
        contractId: contractInstance.id,
        assetName: contractInstance.assetName,
        status: contractInstance.calculateStatus(),
        annualValue: contractInstance.getAnnualValue(),
        startDate: formatServerDate(contractInstance.startDate),
        endDate: formatServerDate(contractInstance.getEndDate()),
        supplier: contractInstance.supplier,
        legalEntity: contractInstance.legalEntity,
        expenditureType: contractInstance.expenditureType,
        
        fy26Baseline: proj26.calculateBaseline(), fy26Optimized: proj26.calculateOptimized(),
        fy27Baseline: proj27.calculateBaseline(), fy27Optimized: proj27.calculateOptimized(),
        fy28Baseline: proj28.calculateBaseline(), fy28Optimized: proj28.calculateOptimized()
      };

      // Safety Net locale per preservare le proprietà custom del contratto
      const rawRowBacking = contractInstance.exportToData();
      for (let key in rawRowBacking) {
        if (!rowDto.hasOwnProperty(key)) rowDto[key] = rawRowBacking[key];
      }

      if (rowDto.fy26Baseline > 0 || rowDto.fy27Baseline > 0 || rowDto.fy28Baseline > 0) {
        outputRows.push(rowDto);
      }
    });

    this.repository.rewriteTable(outputRows);
    console.log(`PROJECTION DOMAIN: Scrittura completata per ${outputRows.length} linee di proiezione fiscali.`);
  }
}

const ProjectionDomain = new ProjectionService();