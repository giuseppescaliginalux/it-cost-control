/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: PROJECTIONS DOMAIN (ANTI DOUBLE-COUNTING)
 * ============================================================================
 * Sviluppa le proiezioni fiscali pluriennali.
 * Integra l'intelligenza topologica per arrestare il rollover dei contratti
 * nel momento esatto in cui subentra un contratto successore.
 * ============================================================================
 */

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

/**
 * @class ContractProjection
 * @description Modello ERP Monthly Pro-Rata (Standard IFRS/SAP).
 * Applica Rate Flat sui mesi interi e ratei proporzionali sui bordi spezzati.
 */
class ContractProjection {
  constructor(contract, period, linkedInitiatives = [], successorStartDate = null) {
    this.contract = contract;
    this.period = period;
    this.linkedInitiatives = linkedInitiatives;
    
    this.contractStart = contract["Start Date"] ? new Date(contract["Start Date"]) : null;
    this.contractEnd = contract["End Date"] ? new Date(contract["End Date"]) : null;
    
    const isRecurrent = String(this.contract["Cost Recurrence"]).toLowerCase() === "recurrent";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
    if (this.contract["Cost Recurrence"] === "One-Shot") {
      if (this.contractStart >= this.period.startDate && this.contractStart <= this.period.endDate) {
        return parseFloat(this.contract["Total Commitment"]) || 0;
      }
      return 0;
    }

    const monthlyFlatRate = (parseFloat(this.contract["Annual Value"]) || 0) / 12;
    let totalBaseline = 0;

    const startCursor = new Date(Math.max(this.period.startDate, this.contractStart));
    const endCursor = new Date(Math.min(this.period.endDate, this.effectiveEndDate));
    if (startCursor > endCursor) return 0;

    let current = new Date(startCursor);
    current.setDate(1); // Allinea lo scanner al primo giorno del mese

    while (current <= endCursor) {
      let monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      let monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      let overlapStart = monthStart < startCursor ? startCursor : monthStart;
      let overlapEnd = monthEnd > endCursor ? endCursor : monthEnd;

      if (overlapStart <= overlapEnd) {
        let activeDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        let daysInMonth = Math.round((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;

        if (activeDays === daysInMonth) {
          totalBaseline += monthlyFlatRate; // Mese intero: Rata Flat!
        } else {
          totalBaseline += monthlyFlatRate * (activeDays / daysInMonth); // Mese spezzato: Spezzatura ERP!
        }
      }
      current.setMonth(current.getMonth() + 1); // Salto quantico di un mese! (Performance)
    }
    return parseFloat(totalBaseline.toFixed(2));
  }

  calculateOptimized() {
    if (this.daysOfCompetence <= 0) return 0;
    if (this.contract["Cost Recurrence"] === "One-Shot") return this.calculateBaseline();

    const activeInits = this.linkedInitiatives.filter(init => 
      ["COMPLETED", "IN PROGRESS"].includes(String(init.status || init.initiativeStatus).toUpperCase())
    );

    if (activeInits.length === 0) return this.calculateBaseline();
    activeInits.sort((a, b) => a.getEffectiveDate() - b.getEffectiveDate());

    const monthlyFlatRate = (parseFloat(this.contract["Annual Value"]) || 0) / 12;
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
        let activeDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        
        // Quota giornaliera speculare per QUESTO preciso mese
        let dailyRateForMonth = monthlyFlatRate / daysInMonth;

        let dayCursor = new Date(overlapStart);
        while (dayCursor <= overlapEnd) {
          let dayRateModifier = 1.0;
          let isTerminated = false;

          for (let init of activeInits) {
            if (dayCursor >= init.getEffectiveDate()) {
              const strategy = String(init.decision).toUpperCase();
              if (["TERMINATE", "REPLACE", "TRANSFER"].includes(strategy)) {
                isTerminated = true; break;
              } else {
                const pct = init.targetSavingPct > 1 ? init.targetSavingPct / 100 : init.targetSavingPct;
                dayRateModifier = Math.max(0, dayRateModifier - pct);
              }
            }
          }

          if (!isTerminated) totalOptimized += dailyRateForMonth * dayRateModifier;
          dayCursor.setDate(dayCursor.getDate() + 1);
        }
      }
      current.setMonth(current.getMonth() + 1); // Salto quantico mensile
    }
    return parseFloat(totalOptimized.toFixed(2));
  }

  exportToData() {
    const baseline = this.calculateBaseline();
    const optimized = this.calculateOptimized();
    return {
      ...this.contract,
      "Days of Competence": this.daysOfCompetence,
      "Baseline Spend": baseline,
      "Optimized Spend": optimized,
      "Delta Saving": parseFloat((baseline - optimized).toFixed(2))
    };
  }
}

// ============================================================================
// REPOSITORY LAYER (BULK GENERATION ON HEADERS)
// ============================================================================
class ProjectionRepository {
  constructor() {
    this.sheetName = CONFIG.SHEETS.PROJECTIONS;
  }

  rewriteTable(matrixObjects) {
    const ctx = getSheetContext(this.sheetName);
    if (!ctx.sheet) throw new Error("FiscalProjections sheet infrastructure missing.");

    if (ctx.sheet.getLastRow() > 1) {
      ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.headers.length).clearContent();
    }

    if (matrixObjects.length === 0) return;

    const rows = matrixObjects.map(rowObj => {
      return ctx.headers.map(h => {
        let val = rowObj[h];
        return val !== undefined && val !== null ? val : "";
      });
    });

    ctx.sheet.getRange(2, 1, rows.length, ctx.headers.length).setValues(rows);
    console.log(`PROJECTION REPOSITORY: Tabella rigenerata completamente per ${rows.length} record.`);
  }
}

// ============================================================================
// SERVICE LAYER (L'ORCHESTRATORE TABELLARE ORIZZONTALE)
// ============================================================================
class ProjectionService {
  constructor() {
    this.repository = new ProjectionRepository();
    this.fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
    this.fy27 = new TimePeriod("FY27", "2026-07-01", "2027-06-30");
    this.fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
  }

  recalculateAll() {
    console.log("PROJECTION SERVICE: Generazione report orizzontale in corso...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Acquisizione topologia di rete
    const allMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allContracts = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];
    const allInitsRaw = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
    
    const domainInitiatives = allInitsRaw.map(i => new Initiative({
      initiativeId: i["Initiative ID"],
      masterId: i["Master Contract ID"],
      initiativeStatus: i["Initiative Status"],
      decision: i["Decision"],
      targetDate: i["Target Date"],
      actualDate: i["Actual Date"],
      targetSavingPct: i["Target Saving %"]
    }));

    const outputRows = [];

    allContracts.forEach(contract => {
      const mId = String(contract["Master Contract ID"] || contract.masterId).trim();
      const linkedInits = domainInitiatives.filter(init => String(init.masterId).trim() === mId);

      // Ricerca dell'eventuale master successore nella Timeline
      const successorMaster = allMasters.find(m => {
          const prevs = String(m["Previous Master ID"] || "").split(',').map(s => s.trim());
          return prevs.includes(mId);
      });
      
      let successorStart = null;
      if (successorMaster && successorMaster["Master Start Date"]) {
          successorStart = new Date(successorMaster["Master Start Date"]);
      }

      // Iniezione della consapevolezza del successore nei calcoli del periodo
      const proj26 = new ContractProjection(contract, this.fy26, linkedInits, successorStart);
      const proj27 = new ContractProjection(contract, this.fy27, linkedInits, successorStart);
      const proj28 = new ContractProjection(contract, this.fy28, linkedInits, successorStart);

      const rowData = {
        "Contract ID": contract["Contract ID"] || "",
        "Asset Name": contract["Asset Name"] || "",
        "Status": contract["Status"] || "",
        "Annual Value": parseFloat(contract["Annual Value"]) || 0,
        "Start Date": formatServerDate(proj26.contractStart),
        "End Date": formatServerDate(proj26.contractEnd),
        "Supplier": contract["Supplier"] || "",
        "Legal Entity": contract["Legal Entity"] || "",
        "Expenditure Type": contract["Expenditure Type"] || "",
        
        "FY26 Baseline": proj26.calculateBaseline(),
        "FY26 Optimized": proj26.calculateOptimized(),
        "FY27 Baseline": proj27.calculateBaseline(),
        "FY27 Optimized": proj27.calculateOptimized(),
        "FY28 Baseline": proj28.calculateBaseline(),
        "FY28 Optimized": proj28.calculateOptimized()
      };

      if (rowData["FY26 Baseline"] > 0 || rowData["FY27 Baseline"] > 0 || rowData["FY28 Baseline"] > 0) {
        outputRows.push(rowData);
      }
    });

    this.repository.rewriteTable(outputRows);
    console.log("PROJECTION SERVICE: Allineamento automatico tabelle completato.");
  }
}

const ProjectionDomain = new ProjectionService();