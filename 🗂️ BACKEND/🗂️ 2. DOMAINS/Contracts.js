/**
 * ============================================================================
 * FINOPS PURE DOMAIN: Contracts
 * ============================================================================
 * Entità di dominio isomorfiche (Client/Server). Ignorano totalmente
 * l'esistenza di Google Sheets, Mappers o Services.
 */

class LedgerMovement {
  constructor(data = {}) {
    Object.assign(this, data);
    this.contractId = this.contractId || "";
    this.startDate = this.startDate ? new Date(this.startDate) : null;
    this.endDate = this.endDate ? new Date(this.endDate) : null;
    this.type = String(this.type || "ACTUAL").toUpperCase();
    this.amount = parseFloat(this.amount) || 0;
  }
  isForecast() { return this.type === "FORECAST" || this.type === "CALCULATED"; }
  isActual() { return this.type === "ACTUAL"; }
  exportToData() {
    return {
      ...this,
      startDate: formatServerDate(this.startDate),
      endDate: formatServerDate(this.endDate)
    };
  }
}

class AllocationSplit {
  constructor(data = {}) {
    Object.assign(this, data);
    this.splitId = this.splitId || "SPL-TMP-" + Math.floor(Math.random() * 10000);
    this.allocationRule = this.allocationRule || "Percentage";
    this.fixedAmount = parseFloat(this.fixedAmount) || 0;
    this.unitsAssigned = parseFloat(this.unitsAssigned) || 0;
    this.validFrom = this.validFrom ? new Date(this.validFrom) : null;
    this.validTo = this.validTo ? new Date(this.validTo) : null;
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
      ...this,
      percentageShare: outPct,
      fixedAmount: this.allocationRule === "Fixed Amount" ? this.fixedAmount : "",
      unitsAssigned: this.allocationRule === "Units" ? this.unitsAssigned : "",
      validFrom: formatServerDate(this.validFrom),
      validTo: formatServerDate(this.validTo)
    };
  }
}

class Contract {
  constructor(data = {}) {
    Object.assign(this, data);
    this.id = this.contractId || this.id || "";
    this.assetId = this.assetId || "";
    this.startDate = this.startDate ? new Date(this.startDate) : null;
    this.contractEndDate = this.contractEndDate ? new Date(this.contractEndDate) : null;
    this.adjustedEndDate = this.adjustedEndDate ? new Date(this.adjustedEndDate) : null;

    this.costRecurrence = this.costRecurrence || "Recurrent";
    this.pricingModel = this.pricingModel || "Flat";

    let rawBt = (this.billingTerms || "").trim();
    let rawBf = (this.billingFrequency || "").trim();
    const pm = (this.pricingModel || "").trim();

    if (rawBt === "Fixed Recurring" && rawBf === "") rawBf = "Monthly";
    else if (rawBt === "Linear") { rawBt = "Fixed Recurring"; rawBf = "Monthly"; }
    else if (rawBt === "Quarterly") { rawBt = "Fixed Recurring"; rawBf = "Quarterly"; }
    else if (rawBt === "Full Upfront") { rawBt = "Full Upfront / Prepaid"; rawBf = ""; }
    else if (rawBt === "Ledger-Driven") {
      if (pm === "Minimum Consumption" || pm === "Capped Consumption") rawBt = "Pay-As-You-Go";
      else rawBt = "Custom / Ledger Driven";
    }
    else if (rawBt === "") { rawBt = "Fixed Recurring"; rawBf = "Monthly"; }

    this.billingTerms = rawBt;
    this.billingFrequency = rawBf;
    this.totalCommitment = parseFloat(this.totalCommitment) || 0;
    this.annualValue = (this.annualValue === "" || this.annualValue === null || this.annualValue === undefined)
      ? this.annualValue
      : parseFloat(this.annualValue) || 0;

    this.ledger = [];
    this.splits = [];
  }

  getEndDate() { return (this.adjustedEndDate && !isNaN(this.adjustedEndDate.getTime())) ? this.adjustedEndDate : this.contractEndDate; }

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

  getDurationMonths() { return Math.round(this._getExactMonths(this.startDate, this.getEndDate())); }

  getEffectiveCommitment() {
    if (this.costRecurrence === "One-Shot") return parseFloat(this.totalCommitment.toFixed(2));
    if (!this.startDate || !this.contractEndDate || !this.getEndDate()) return 0;
    const origMonths = this._getExactMonths(this.startDate, this.contractEndDate);
    const actMonths = this._getExactMonths(this.startDate, this.getEndDate());
    let baseCommitment = parseFloat((this.totalCommitment * (actMonths / (origMonths || 1))).toFixed(2));

    // ⚡ CALCOLO SIMMETRICO: I crediti abbassano l'impegno, i debiti (overusage) lo alzano
    const creditsSum = this.ledger.filter(l => String(l.type).toUpperCase().trim() === "CREDIT").reduce((sum, l) => sum + Math.abs(parseFloat(l.amount) || 0), 0);
    const debitsSum = this.ledger.filter(l => String(l.type).toUpperCase().trim() === "DEBIT").reduce((sum, l) => sum + Math.abs(parseFloat(l.amount) || 0), 0);

    return parseFloat((baseCommitment + debitsSum - creditsSum).toFixed(2));
  }

  getAnnualValue() {
    if (this.costRecurrence === "One-Shot") return parseFloat(this.totalCommitment.toFixed(2));
    if (!this.startDate || !this.contractEndDate) return 0;
    const origMonths = this._getExactMonths(this.startDate, this.contractEndDate);
    return parseFloat(((this.totalCommitment / Math.max(0.0001, origMonths)) * 12).toFixed(2));
  }

  getEffectiveRunRate() {
    const nominalRunRate = this.getAnnualValue();
    let totalCredits = 0;
    (this.ledger || []).forEach(l => {
      if (String(l.type).toUpperCase().trim() === "CREDIT") {
        totalCredits += Math.abs(parseFloat(l.amount) || 0);
      }
    });
    return parseFloat(Math.max(0, nominalRunRate - totalCredits).toFixed(2));
  }

  calculateStatus() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
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
      if (totalPct > 100.001) throw new Error(`Policy Violation: Gli split del contratto ${this.id} superano il 100%.`);
    }
  }

  exportToData() {
    return {
      ...this,
      contractId: this.id,
      startDate: formatServerDate(this.startDate),
      contractEndDate: formatServerDate(this.contractEndDate),
      adjustedEndDate: formatServerDate(this.adjustedEndDate),
      endDate: formatServerDate(this.getEndDate()),
      contractTerm: this.getDurationMonths(),
      effectiveCommitment: this.getEffectiveCommitment(),
      annualValue: (this.annualValue === undefined || this.annualValue === null || String(this.annualValue).trim() === "")
        ? this.getAnnualValue()
        : (isNaN(parseFloat(this.annualValue)) ? this.getAnnualValue() : parseFloat(this.annualValue)),
      effectiveRunRate: this.getEffectiveRunRate(),
      status: (this.status === undefined || this.status === null || String(this.status).trim() === "")
        ? this.calculateStatus()
        : this.status
    };
  }

  generateForecastLedger(currentLedger = []) {
    const bt = String(this.billingTerms).toUpperCase().trim();
    const pm = String(this.pricingModel).toUpperCase().trim();
    const freq = String(this.billingFrequency).toUpperCase().trim();

    if (this.costRecurrence === "One-Shot" || !this.startDate || !this.getEndDate()) return [];
    if (bt.includes("UPFRONT") || bt.includes("PREPAID") || bt.includes("CUSTOM")) return [];

    const movements = [];
    const finalEnd = this.getEndDate();
    let currentCursor = new Date(this.startDate.getTime());

    // Configurazione step temporale in base alla Billing Frequency
    let stepMonths = 1;
    if (freq === "QUARTERLY") stepMonths = 3;
    else if (freq === "EVERY 4 MONTHS") stepMonths = 4;
    else if (freq === "BI-ANNUALLY") stepMonths = 6;
    else if (freq === "ANNUALLY") stepMonths = 12;

    if (bt.includes("FIXED RECURRING")) {
      const annualChunks = 12 / stepMonths;
      const periodAmount = this.getAnnualValue() / annualChunks;

      while (currentCursor <= finalEnd) {
        const chunkStart = new Date(currentCursor.getTime());
        const chunkEnd = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + stepMonths, 0);

        const hasCoverage = currentLedger.some(l => {
          const type = String(l.type || "").toUpperCase().trim();
          if ((type !== "ACTUAL" && type !== "FORECAST" && type !== "DEBIT") || !l.startDate) return false;
          const d = new Date(l.startDate);
          return d.getFullYear() === chunkStart.getFullYear() && d.getMonth() === chunkStart.getMonth();
        });

        if (!hasCoverage) {
          const actualEnd = chunkEnd > finalEnd ? finalEnd : chunkEnd;
          movements.push(new LedgerMovement({
            contractId: this.id,
            startDate: formatServerDate(chunkStart),
            endDate: formatServerDate(actualEnd),
            type: "CALCULATED",
            amount: parseFloat(periodAmount.toFixed(2)),
            notes: `Expected Invoice (${freq || 'Monthly'})`
          }));
        }
        currentCursor = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + stepMonths, 1);
      }
      return movements;
    }

    if (bt.includes("PAY-AS-YOU-GO") && (pm.includes("MINIMUM") || pm.includes("CAPPED"))) {
      // ⚡ DETRAZIONE DI TUTTE LE RIGHE REALI (COMPRESI I DEBITI DA OVERUSAGE E CREDITI)
      const actSum = currentLedger.filter(l => String(l.type).toUpperCase().trim() === "ACTUAL").reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
      const crSum = currentLedger.filter(l => String(l.type).toUpperCase().trim() === "CREDIT").reduce((sum, l) => sum + Math.abs(parseFloat(l.amount) || 0), 0);
      const dbSum = currentLedger.filter(l => String(l.type).toUpperCase().trim() === "DEBIT").reduce((sum, l) => sum + Math.abs(parseFloat(l.amount) || 0), 0);
      const fwdSum = currentLedger.filter(l => String(l.type).toUpperCase().trim() === "FORECAST").reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

      const remainingCommitment = Math.max(0, this.totalCommitment - (actSum - crSum + dbSum) - fwdSum);

      let lastActualEnd = new Date(this.startDate.getTime() - 86400000);
      currentLedger.forEach(l => {
        const type = String(l.type || "").toUpperCase().trim();
        if ((type === "ACTUAL" || type === "DEBIT") && l.endDate) {
          const d = new Date(l.endDate);
          if (d > lastActualEnd) lastActualEnd = d;
        }
      });

      let forecastStart = new Date(lastActualEnd.getTime());
      forecastStart.setDate(forecastStart.getDate() + 1);
      if (forecastStart < this.startDate) forecastStart = new Date(this.startDate.getTime());
      if (forecastStart > finalEnd) return [];

      let tempCursor = new Date(forecastStart.getTime());
      tempCursor.setDate(1);

      // Conteggio intervalli frequenziali residui effettivi
      let intervalsRemaining = 0;
      while (tempCursor <= finalEnd) {
        const chunkStart = new Date(tempCursor.getTime());
        const hasForecastInPeriod = currentLedger.some(l => {
          const type = String(l.type || "").toUpperCase().trim();
          if (type !== "FORECAST" || !l.startDate) return false;
          const d = new Date(l.startDate);
          return d >= chunkStart && d < new Date(chunkStart.getFullYear(), chunkStart.getMonth() + stepMonths, 1);
        });

        if (!hasForecastInPeriod) {
          intervalsRemaining++;
        }
        tempCursor.setMonth(tempCursor.getMonth() + stepMonths);
      }

      if (intervalsRemaining <= 0 || remainingCommitment <= 0) return [];
      const intervalForecastAmount = remainingCommitment / intervalsRemaining;

      let generateCursor = new Date(forecastStart.getTime());
      generateCursor.setDate(1);

      while (generateCursor <= finalEnd) {
        const chunkStart = new Date(generateCursor.getTime());
        const chunkEnd = new Date(generateCursor.getFullYear(), generateCursor.getMonth() + stepMonths, 0);
        const actualEnd = chunkEnd > finalEnd ? finalEnd : chunkEnd;

        const hasManualForecast = currentLedger.some(l => {
          const type = String(l.type || "").toUpperCase().trim();
          if (type !== "FORECAST" || !l.startDate) return false;
          const d = new Date(l.startDate);
          return d >= chunkStart && d <= actualEnd;
        });

        if (!hasManualForecast) {
          movements.push(new LedgerMovement({
            contractId: this.id,
            startDate: formatServerDate(chunkStart),
            endDate: formatServerDate(actualEnd),
            type: "CALCULATED",
            amount: parseFloat(intervalForecastAmount.toFixed(2)),
            notes: `Engine-generated forecast (Remaining Commitment)`
          }));
        }
        generateCursor = new Date(generateCursor.getFullYear(), generateCursor.getMonth() + stepMonths, 1);
      }
      return movements;
    }
    return [];
  }

  exportFullLedger() {
    const fullLedger = [];
    this.ledger.forEach(l => {
      if (l.type !== "CALCULATED") {
        if (typeof l.exportToData === 'function') fullLedger.push(l.exportToData());
        else fullLedger.push(new LedgerMovement(l).exportToData());
      }
    });
    this.generateForecastLedger(this.ledger).forEach(f => fullLedger.push(f.exportToData()));

    // ⚡ INVERSIONE CRONOLOGICA: Dal più recente al più vecchio (startDate desc)
    fullLedger.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    return fullLedger;
  }

  calculateYtdRoySplit(simulatedToday = new Date(), currentLedger = null) {
    const bt = String(this.billingTerms).toUpperCase().trim();
    let ytd = 0; let roy = 0;
    const ledgerToUse = currentLedger || this.ledger || [];

    if (bt.includes("UPFRONT") || bt.includes("PREPAID")) {
      if (this.costRecurrence === "One-Shot") {
        if (this.startDate <= simulatedToday) ytd = this.totalCommitment;
        else roy = this.totalCommitment;
      } else {
        const startMonth = this.startDate.getFullYear() * 12 + this.startDate.getMonth();
        const endMonth = this.getEndDate().getFullYear() * 12 + this.getEndDate().getMonth();
        const currentMonth = simulatedToday.getFullYear() * 12 + simulatedToday.getMonth();

        let passedMonths = currentMonth - startMonth;
        if (passedMonths < 0) passedMonths = 0;

        const totalDurationMonths = endMonth - startMonth + 1;
        if (passedMonths > totalDurationMonths) passedMonths = totalDurationMonths;

        const monthlyRate = this.getAnnualValue() / 12;
        ytd = passedMonths * monthlyRate;
        roy = (totalDurationMonths - passedMonths) * monthlyRate;
      }
    } else {
      ledgerToUse.forEach(m => {
        const type = String(m.type || m.Type || "ACTUAL").toUpperCase();
        const amt = parseFloat(m.amount || m.Amount) || 0;
        if (type === "ACTUAL" || type === "CREDIT") ytd += amt;
        else roy += amt;
      });
    }
    return { ytdActuals: ytd, royForecast: roy };
  }
}

class MasterContract {
  constructor(data = {}) {
    Object.assign(this, data);
    this.id = this.masterId || "";
    this.childContracts = [];
  }

  addChild(contractInstance) {
    contractInstance.masterId = this.id;
    contractInstance.supplier = this.supplier;
    contractInstance.assetName = this.assetName;
    contractInstance.assetId = this.assetId;
    contractInstance.billingChannel = this.billingChannel;

    // 🟢 FIX ARCHITETTURALE: Prevenzione duplicati nel Dominio (Upsert)
    // Garantisce che un Aggregato Radice non possa MAI contenere due figli con lo stesso ID
    const existingIndex = this.childContracts.findIndex(c =>
      c.id === contractInstance.id &&
      c.id !== "" &&
      !String(c.id).toUpperCase().startsWith("TMP-")
    );

    if (existingIndex > -1) {
      // Se esiste già, lo sovrascrive (l'ultima modifica vince)
      this.childContracts[existingIndex] = contractInstance;
    } else {
      // Altrimenti lo accoda
      this.childContracts.push(contractInstance);
    }
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
    if (recurrentContracts.length === 0) return 0;
    const sumRunRates = recurrentContracts.reduce((sum, c) => sum + c.getAnnualValue(), 0);
    return parseFloat(sumRunRates.toFixed(2));
  }

  getEffectiveRunRate() {
    const recurrentContracts = this.childContracts.filter(c => String(c.costRecurrence).toLowerCase() === "recurrent");
    if (recurrentContracts.length === 0) return 0;
    const sumRunRates = recurrentContracts.reduce((sum, c) => sum + (typeof c.getEffectiveRunRate === 'function' ? c.getEffectiveRunRate() : 0), 0);
    return parseFloat(sumRunRates.toFixed(2));
  }

  deriveStatus(linkedInitiatives) {
    let checkTerminated = 0;
    let checkNegotiation = 0;

    const childStatuses = this.childContracts.map(c => c.calculateStatus());
    const hasActiveChilds = childStatuses.includes("ACTIVE");
    const hasUpcomingChilds = childStatuses.includes("UPCOMING");

    linkedInitiatives.forEach(init => {
      const initStatus = String(init.status || "").toUpperCase().trim();
      const decision = String(init.decision || "").toUpperCase().trim();
      if (initStatus === "COMPLETED" && ["TERMINATE", "REPLACE", "TRANSFER"].includes(decision)) checkTerminated++;
      if (initStatus === "IN PROGRESS") checkNegotiation++;
    });

    if (checkTerminated > 0) return "TERMINATED";
    if (hasActiveChilds) return "ACTIVE";
    if (hasUpcomingChilds) return "UPCOMING";
    if (checkNegotiation > 0) return "IN NEGOTIATION";
    return "EXPIRED";
  }

  exportToData(linkedInitiatives) {
    const start = this.getMinStartDate();
    const end = this.getMaxEndDate();
    let termMonths = 0;
    if (start && end && start <= end) {
      termMonths = Math.round(this._getExactMonths(start, end));
    }
    const nominalCommitment = parseFloat(this.childContracts.reduce((sum, c) => sum + (c.totalCommitment || 0), 0).toFixed(2));

    return {
      ...this,
      masterId: this.id,
      masterStartDate: formatServerDate(start),
      masterEndDate: formatServerDate(end),
      contractTerm: termMonths,
      totalCommitment: this.getTotalCommitment(),
      nominalCommitment: nominalCommitment,
      runRate: this.getRunRate(),
      effectiveRunRate: this.getEffectiveRunRate(),
      status: this.deriveStatus(linkedInitiatives)
    };
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
}