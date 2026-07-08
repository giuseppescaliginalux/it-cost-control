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
  constructor(contractDto, period, linkedInitiatives = [], successorStartDate = null, fullLedger = []) {
    this.contract = contractDto;
    this.period = period;
    this.linkedInitiatives = linkedInitiatives;
    this.fullLedger = fullLedger || [];

    // 🌟 I NUOVI SECCHIELLI IN RAM (Zero impatto sui DB e sui Test originali)
    this.monthlyBaselineActual = {};
    this.monthlyBaselineVirtual = {};
    this.monthlyOptimizedActual = {};
    this.monthlyOptimizedVirtual = {};

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

  // 🌟 HELPER DRY: Prende appunti mese per mese senza toccare la matematica dei totali
  _recordMonthlySplit(targetActual, targetVirtual, dateObj, amount) {
    if (!dateObj || isNaN(dateObj.getTime()) || amount === 0) return;
    const mk = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const isVirtual = this.contractEnd && dateObj > this.contractEnd;
    const targetDict = isVirtual ? targetVirtual : targetActual;
    targetDict[mk] = (targetDict[mk] || 0) + amount;
  }

  calculateBaseline() {
    if (this.daysOfCompetence <= 0) return 0;

    const bt = String(this.contract.billingTerms || "").toUpperCase().trim();
    const expType = String(this.contract.expenditureType || "").toUpperCase().trim();
    const isUpfrontCapex = expType === "CAPEX" && (bt.includes("UPFRONT") || bt.includes("PREPAID"));

    if (bt.includes("PAY-AS-YOU-GO") || bt.includes("CUSTOM") || bt.includes("LEDGER")) {
      let periodTotal = 0;
      const pStart = this.period.startDate;
      const pEnd = this.period.endDate;

      this.fullLedger.forEach(mov => {
        const mStart = new Date(mov.startDate || mov.StartDate);
        if (isNaN(mStart.getTime())) return;

        const mEnd = mov.endDate ? new Date(mov.endDate) : new Date(mStart.getTime() + 86400000);
        const overlapStart = mStart < pStart ? pStart : mStart;
        const overlapEnd = mEnd > pEnd ? pEnd : mEnd;

        if (overlapStart <= overlapEnd) {
          const movDays = Math.max(1, Math.round((mEnd - mStart) / 86400000) + 1);
          const overlapDays = Math.max(1, Math.round((overlapEnd - overlapStart) / 86400000) + 1);
          const amt = parseFloat(mov.amount || mov.Amount) || 0;

          let share = 0;
          if (movDays === overlapDays) share = amt;
          else share = amt * (overlapDays / movDays);

          periodTotal += share;
          this._recordMonthlySplit(this.monthlyBaselineActual, this.monthlyBaselineVirtual, overlapStart, share);
        }
      });
      return parseFloat(periodTotal.toFixed(2));
    }

    if (this.contract.costRecurrence === "One-Shot" || isUpfrontCapex) {
      let totalHit = 0;
      if (this.contractStart && this.contractStart >= this.period.startDate && this.contractStart <= this.period.endDate) {
        const hit = parseFloat(this.contract.totalCommitment) || 0;
        totalHit += hit;
        this._recordMonthlySplit(this.monthlyBaselineActual, this.monthlyBaselineVirtual, this.contractStart, hit);
      }
      if (this.contract.costRecurrence === "Recurrent" && this.contractEnd && this.effectiveEndDate > this.contractEnd) {
        let termMonths = parseFloat(this.contract.contractTerm) || 12;
        if (termMonths <= 0) termMonths = 12;
        let nextRenewal = new Date(this.contractEnd);
        nextRenewal.setDate(nextRenewal.getDate() + 1);
        let safeguard = 0;
        while (nextRenewal <= this.period.endDate && nextRenewal < this.effectiveEndDate && safeguard < 100) {
          if (nextRenewal >= this.period.startDate) {
            const hit2 = parseFloat(this.contract.totalCommitment) || 0;
            totalHit += hit2;
            this._recordMonthlySplit(this.monthlyBaselineActual, this.monthlyBaselineVirtual, nextRenewal, hit2);
          }
          nextRenewal.setMonth(nextRenewal.getMonth() + termMonths);
          safeguard++;
        }
      }
      return parseFloat(totalHit.toFixed(2));
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

        let share = 0;
        if (activeDays === daysInMonth) share = monthlyFlatRate;
        else share = monthlyFlatRate * (activeDays / daysInMonth);

        totalBaseline += share;
        this._recordMonthlySplit(this.monthlyBaselineActual, this.monthlyBaselineVirtual, monthStart, share);
      }
      current.setMonth(current.getMonth() + 1);
    }
    return parseFloat(totalBaseline.toFixed(2));
  }

  calculateOptimized() {
    if (this.daysOfCompetence <= 0) return 0;

    const activeInits = this.linkedInitiatives.filter(init =>
      ["COMPLETED", "IN PROGRESS", "IDEA", "APPROVED", "PLANNED"].includes(String(init.status).toUpperCase())
    );

    const bt = String(this.contract.billingTerms || "").toUpperCase().trim();
    const expType = String(this.contract.expenditureType || "").toUpperCase().trim();
    const isUpfrontCapex = expType === "CAPEX" && (bt.includes("UPFRONT") || bt.includes("PREPAID"));

    if (activeInits.length === 0 || bt.includes("PAY-AS-YOU-GO") || bt.includes("CUSTOM") || bt.includes("LEDGER")) {
      const res = this.calculateBaseline();
      if (activeInits.length === 0) {
        // Popola i secchielli speculari direttamente dalla baseline
        Object.assign(this.monthlyOptimizedActual, this.monthlyBaselineActual);
        Object.assign(this.monthlyOptimizedVirtual, this.monthlyBaselineVirtual);
      }
      return res;
    }

    activeInits.sort((a, b) => a.getEffectiveDate() - b.getEffectiveDate());

    if (this.contract.costRecurrence === "One-Shot" || isUpfrontCapex) {
      let totalOptimized = 0;

      const getDiscountedCostAt = (dateToCheck) => {
        let currentCost = parseFloat(this.contract.totalCommitment) || 0;
        let isTerminated = false;
        for (let init of activeInits) {
          const initEffDate = init.getEffectiveDate();
          if (initEffDate) initEffDate.setHours(0, 0, 0, 0);

          if (dateToCheck >= initEffDate) {
            if (["TERMINATE", "REPLACE", "TRANSFER"].includes(String(init.decision).toUpperCase())) {
              isTerminated = true;
            } else {
              let globalSavingPct = parseFloat(init.targetSavingPct) || 0;
              if (globalSavingPct > 1) globalSavingPct = globalSavingPct / 100;
              currentCost = currentCost * (1.0 - globalSavingPct);
            }
          }
        }
        return isTerminated ? 0 : currentCost;
      };

      if (this.contractStart && this.contractStart >= this.period.startDate && this.contractStart <= this.period.endDate) {
        const hit = getDiscountedCostAt(this.contractStart);
        totalOptimized += hit;
        this._recordMonthlySplit(this.monthlyOptimizedActual, this.monthlyOptimizedVirtual, this.contractStart, hit);
      }

      if (this.contract.costRecurrence === "Recurrent" && this.contractEnd && this.effectiveEndDate > this.contractEnd) {
        let termMonths = parseFloat(this.contract.contractTerm) || 12;
        if (termMonths <= 0) termMonths = 12;
        let nextRenewal = new Date(this.contractEnd);
        nextRenewal.setDate(nextRenewal.getDate() + 1);

        let safeguard = 0;
        while (nextRenewal <= this.period.endDate && nextRenewal < this.effectiveEndDate && safeguard < 100) {
          if (nextRenewal >= this.period.startDate) {
            const hit2 = getDiscountedCostAt(nextRenewal);
            totalOptimized += hit2;
            this._recordMonthlySplit(this.monthlyOptimizedActual, this.monthlyOptimizedVirtual, nextRenewal, hit2);
          }
          nextRenewal.setMonth(nextRenewal.getMonth() + termMonths);
          safeguard++;
        }
      }
      return parseFloat(totalOptimized.toFixed(2));
    }

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
        this._recordMonthlySplit(this.monthlyOptimizedActual, this.monthlyOptimizedVirtual, overlapStart, monthAccumulator);
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

  // ⚡ REVERSE ENGINEERING ULTRA-VELOCE O(1): ~15 millisecondi (NO ricalcoli day-by-day)
  enrichProjectionsWithMonthlySplits(rawProjections, allContracts = [], allInitiatives = []) {
    if (!rawProjections || rawProjections.length === 0) return [];

    // 1. Mappe in RAM per Lookup istantaneo (Anti-Crash e Anti-Lag)
    const contractsMap = new Map();
    allContracts.forEach(c => contractsMap.set(String(c["Contract ID"] || c.contractId).trim(), c));

    const initsByMaster = new Map();
    allInitiatives.forEach(i => {
      const status = String(i["Initiative Status"] || i.status || "").toUpperCase();
      if (["COMPLETED", "IN PROGRESS", "IDEA"].includes(status)) {
        const mid = String(i["Master Contract ID"] || i.masterId || "").trim();
        if (!initsByMaster.has(mid)) initsByMaster.set(mid, []);
        initsByMaster.get(mid).push(i);
      }
    });

    // 2. Setup Asse Temporale Fiscale
    const monthKeys = [];
    const fyMap = [];
    let dCursor = new Date(2025, 6, 1); // 01 Luglio 2025
    for (let i = 0; i < 36; i++) {
      let y = dCursor.getFullYear();
      let m = dCursor.getMonth();
      monthKeys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      fyMap.push(`FY${String(m >= 6 ? y + 1 : y).slice(-2)}`);
      dCursor.setMonth(m + 1);
    }

    // 3. Elaborazione Lineare (Matematica Pro-Rata Veloce)
    return rawProjections.map(row => {
      const cId = String(row["Contract ID"] || row.contractId || "").trim();
      const contract = contractsMap.get(cId);

      if (!contract) return { ...row, monthlyActual: {}, monthlyVirtual: {} };

      const cEndStr = contract["End Date"] || contract.endDate || contract["Contract End Date"] || contract.contractEndDate;
      const cEnd = cEndStr ? new Date(cEndStr) : null;
      if (cEnd) cEnd.setHours(23, 59, 59, 999);

      const annualValue = parseFloat(contract["Annual Value"] || contract.annualValue) || 0;

      const mId = String(contract["Master Contract ID"] || contract.masterId).trim();
      let inits = initsByMaster.get(mId) || [];
      inits = inits.filter(i => {
        const targetCid = String(i["Contract ID"] || i.contractId || "").trim();
        return targetCid === "" || targetCid === cId;
      });
      inits.sort((a, b) => new Date(a["Target Date"] || a.targetDate) - new Date(b["Target Date"] || b.targetDate));

      const actVals = {};
      const virtVals = {};

      // A. Creazione della forma mensile teorica (Gradienti di Run-Rate)
      monthKeys.forEach((mk, idx) => {
        const [y, m] = mk.split('-');
        const mStart = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        const isVirtual = cEnd && mStart > cEnd;

        let currentRunRate = annualValue;
        let isTerminated = false;

        inits.forEach(init => {
          const tDate = new Date(init["Target Date"] || init.targetDate);
          tDate.setHours(0, 0, 0, 0);
          if (tDate <= mStart) {
            const dec = String(init["Decision"] || init.decision || "").toUpperCase();
            if (["TERMINATE", "REPLACE", "TRANSFER"].includes(dec)) isTerminated = true;
            else {
              const targetCost = parseFloat(init["Target Cost (Annualized)"] || init.targetCostAnnualized);
              if (!isNaN(targetCost) && targetCost >= 0) currentRunRate = targetCost;
            }
          }
        });

        if (!isTerminated) {
          const baseMonthly = currentRunRate / 12;
          if (baseMonthly > 0) {
            if (isVirtual) virtVals[mk] = baseMonthly;
            else actVals[mk] = baseMonthly;
          }
        }
      });

      // B. Quadratura Fiscale (Il database comanda sempre e schiaccia i ratei)
      const applyProRataScale = (fyStr, dbTotal) => {
        let localSum = 0;
        monthKeys.forEach((mk, idx) => {
          if (fyMap[idx] === fyStr) localSum += (actVals[mk] || 0) + (virtVals[mk] || 0);
        });

        if (localSum > 0 && dbTotal > 0) {
          const ratio = dbTotal / localSum;
          monthKeys.forEach((mk, idx) => {
            if (fyMap[idx] === fyStr) {
              if (actVals[mk]) actVals[mk] = parseFloat((actVals[mk] * ratio).toFixed(2));
              if (virtVals[mk]) virtVals[mk] = parseFloat((virtVals[mk] * ratio).toFixed(2));
            }
          });
        } else if (dbTotal > 0 && localSum === 0) {
          const validKeys = monthKeys.filter((_, idx) => fyMap[idx] === fyStr);
          const share = parseFloat((dbTotal / validKeys.length).toFixed(2));
          validKeys.forEach(mk => {
            const [y, m] = mk.split('-');
            const mStart = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
            if (cEnd && mStart > cEnd) virtVals[mk] = share;
            else actVals[mk] = share;
          });
        } else if (dbTotal === 0) {
          monthKeys.forEach((mk, idx) => {
            if (fyMap[idx] === fyStr) {
              if (actVals[mk]) delete actVals[mk];
              if (virtVals[mk]) delete virtVals[mk];
            }
          });
        }
      };

      applyProRataScale('FY26', parseFloat(row["FY26 Optimized"] || row.fy26Optimized) || 0);
      applyProRataScale('FY27', parseFloat(row["FY27 Optimized"] || row.fy27Optimized) || 0);
      applyProRataScale('FY28', parseFloat(row["FY28 Optimized"] || row.fy28Optimized) || 0);

      return { ...row, monthlyActual: actVals, monthlyVirtual: virtVals };
    });
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
        if (initMaster !== mId) return false;
        if (initContract !== "" && initContract !== cId) return false;
        return true;
      });

      const successorMaster = dtosMasters.find(m => {
        const prevs = String(m.previousMasterId || "").split(',').map(s => s.trim()).filter(s => s);
        return prevs.includes(mId);
      });

      let successorStart = null;
      if (successorMaster && successorMaster.masterStartDate) successorStart = new Date(successorMaster.masterStartDate);

      const contractDtoFlat = contractInstance.exportToData();
      const fullLedger = contractInstance.exportFullLedger();

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

      if (rowDto.fy26Baseline > 0 || rowDto.fy27Baseline > 0 || rowDto.fy28Baseline > 0) outputRows.push(rowDto);
    });

    this.repository.rewriteTable(outputRows);
    console.log(`PROJECTION DOMAIN: Scrittura completata per ${outputRows.length} linee di proiezione fiscali.`);
  }
}
const ProjectionDomain = new ProjectionService();