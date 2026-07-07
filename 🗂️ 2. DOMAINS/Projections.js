/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: PROJECTIONS DOMAIN (PURE DTO PATTERN)
 * ============================================================================
 */

const PROJECTION_FIELD_MAP = {
  "Contract ID": "contractId", "Asset Name": "assetName", "Status": "status",
  "Annual Value": "annualValue", "Start Date": "startDate", "End Date": "endDate",
  "Supplier": "supplier", "Legal Entity": "legalEntity", "Expenditure Type": "expenditureType", "Cost Center": "costCenter",
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

class TimePeriod {
  constructor(name, startDateStr, endDateStr) {
    this.startDate = new Date(startDateStr);
    this.endDate = new Date(endDateStr);
    this.name = name;
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
  // Il segreto è qui: inseriamo il 5° parametro blindato con un default ad array vuoto []
  constructor(contractDto, period, linkedInitiatives = [], successorStartDate = null, fullLedger = []) {
    this.contract = contractDto;
    this.period = period;
    this.linkedInitiatives = linkedInitiatives;
    this.fullLedger = fullLedger || []; // Rete di sicurezza anti-null

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

    const bt = String(this.contract.billingTerms || "").toUpperCase().trim();

    // 🌟 SE È A CONSUMO O CUSTOM: Il motore ignora la matematica lineare e legge le fatture/forecast dal Ledger!
    if (bt.includes("PAY-AS-YOU-GO") || bt.includes("CUSTOM") || bt.includes("LEDGER")) {
      let periodTotal = 0;
      const pStart = this.period.startDate;
      const pEnd = this.period.endDate;

      this.fullLedger.forEach(mov => {
        const mStart = new Date(mov.startDate || mov.StartDate);
        if (isNaN(mStart.getTime())) return; // Salta righe corrotte

        const mEnd = mov.endDate ? new Date(mov.endDate) : new Date(mStart.getTime() + 86400000);

        const overlapStart = mStart < pStart ? pStart : mStart;
        const overlapEnd = mEnd > pEnd ? pEnd : mEnd;

        if (overlapStart <= overlapEnd) {
          const movDays = Math.max(1, Math.round((mEnd - mStart) / 86400000) + 1);
          const overlapDays = Math.max(1, Math.round((overlapEnd - overlapStart) / 86400000) + 1);
          const amt = parseFloat(mov.amount || mov.Amount) || 0;

          if (movDays === overlapDays) periodTotal += amt;
          else periodTotal += amt * (overlapDays / movDays); // Pro-rata sui giorni per movimenti a cavallo d'anno
        }
      });
      return parseFloat(periodTotal.toFixed(2));
    }

    // 🌟 SE È FISSO (Flat / Fixed Recurring): Continua con la competenza matematica lineare standard
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

    const activeInits = this.linkedInitiatives.filter(init =>
      ["COMPLETED", "IN PROGRESS", "IDEA", "APPROVED", "PLANNED"].includes(String(init.status).toUpperCase())
    );

    // Se non ci sono rinegoziazioni attive ed è un contratto Ledger-Driven, bypassa il ciclo e restituisce la cassa
    const bt = String(this.contract.billingTerms || "").toUpperCase().trim();
    if (activeInits.length === 0 || bt.includes("PAY-AS-YOU-GO") || bt.includes("CUSTOM") || bt.includes("LEDGER")) {
      if (activeInits.length === 0) return this.calculateBaseline();
    }

    // Ordina le iniziative per data di efficacia crescente
    activeInits.sort((a, b) => a.getEffectiveDate() - b.getEffectiveDate());

    const originalAnnualValue = parseFloat(this.contract.annualValue) || 0;
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
        let monthAccumulator = 0;

        let dayCursor = new Date(overlapStart);
        dayCursor.setHours(0, 0, 0, 0);
        const loopEnd = new Date(overlapEnd);
        loopEnd.setHours(23, 59, 59, 999);

        while (dayCursor <= loopEnd) {
          let currentRunRate = originalAnnualValue;
          let isTerminated = false;

          const testDay = new Date(dayCursor);
          testDay.setHours(0, 0, 0, 0);

          for (let init of activeInits) {
            const initEffDate = init.getEffectiveDate();
            if (initEffDate) initEffDate.setHours(0, 0, 0, 0);

            if (testDay >= initEffDate) {
              if (["TERMINATE", "REPLACE", "TRANSFER"].includes(String(init.decision).toUpperCase())) {
                isTerminated = true;
              } else {
                let globalSavingPct = parseFloat(init.targetSavingPct) || 0;
                if (globalSavingPct > 1) globalSavingPct = globalSavingPct / 100;
                currentRunRate = currentRunRate * (1.0 - globalSavingPct);
              }
            }
          }

          if (!isTerminated) {
            let dailyRateForMonth = (currentRunRate / 12) / daysInMonth;
            monthAccumulator += dailyRateForMonth;
          }

          dayCursor.setDate(dayCursor.getDate() + 1);
        }

        totalOptimized += monthAccumulator;
      }
      current.setMonth(current.getMonth() + 1);
    }
    return parseFloat(totalOptimized.toFixed(2));
  }
}

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

    const rawInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
    const domainInitiatives = rawInits.map(i => new Initiative(InitiativeMapper.toDto(i)));

    const activeDomainContracts = ContractDomain.getHydratedContracts();

    const rawMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const dtosMasters = rawMasters.map(m => ContractMapper.toDto(m, MASTER_FIELD_MAP));

    const outputRows = [];

    activeDomainContracts.forEach(contractInstance => {
      const mId = String(contractInstance.masterId).trim();
      const cId = String(contractInstance.id).trim();
      
      const linkedInits = domainInitiatives.filter(init => {
          const initMaster = String(init.masterId).trim();
          const initContract = String(init.contractId || "").trim();
          
          // Se non appartiene a questo Master, la scarto a prescindere
          if (initMaster !== mId) return false;
          
          // Se l'iniziativa ha un target locale specifico, deve combaciare con QUESTO contratto
          if (initContract !== "" && initContract !== cId) return false;
          
          return true; // Altrimenti (o se è globale) la applico
      });

      const successorMaster = dtosMasters.find(m => {
        const prevs = String(m.previousMasterId || "").split(',').map(s => s.trim()).filter(s => s);
        return prevs.includes(mId);
      });

      let successorStart = null;
      if (successorMaster && successorMaster.masterStartDate) {
        successorStart = new Date(successorMaster.masterStartDate);
      }

      const contractDtoFlat = contractInstance.exportToData();

      // ✨ ESTRAIAMO IL LEDGER PIENO (Actuals + Forecast calcolati dal motore anti-duplicazione)
      const fullLedger = contractInstance.exportFullLedger();

      // ✨ PASSIAMO IL LEDGER ALLE PROIEZIONI
      const proj26 = new ContractProjection(contractDtoFlat, this.fy26, linkedInits, successorStart, fullLedger);
      const proj27 = new ContractProjection(contractDtoFlat, this.fy27, linkedInits, successorStart, fullLedger);
      const proj28 = new ContractProjection(contractDtoFlat, this.fy28, linkedInits, successorStart, fullLedger);

      const rowDto = {
        contractId: contractInstance.id,
        assetName: contractInstance.assetName,
        status: contractInstance.calculateStatus(),
        annualValue: contractInstance.getAnnualValue(),
        startDate: formatServerDate(contractInstance.startDate),
        endDate: formatServerDate(contractInstance.getEndDate()),
        supplier: contractInstance.supplier,
        legalEntity: contractInstance.legalEntity,
        costCenter: contractInstance.costCenter,
        expenditureType: contractInstance.expenditureType,

        fy26Baseline: proj26.calculateBaseline(), fy26Optimized: proj26.calculateOptimized(),
        fy27Baseline: proj27.calculateBaseline(), fy27Optimized: proj27.calculateOptimized(),
        fy28Baseline: proj28.calculateBaseline(), fy28Optimized: proj28.calculateOptimized()
      };

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