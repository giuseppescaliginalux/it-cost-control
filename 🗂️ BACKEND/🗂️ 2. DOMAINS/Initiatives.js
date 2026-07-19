/**
 * ============================================================================
 * FINOPS PURE DOMAIN: Initiatives
 * ============================================================================
 */

class Initiative {
  constructor(data = {}) {
    Object.assign(this, data);
    this.id = this.id || "";
    this.masterId = this.masterId || "";
    this.contractId = this.contractId || "";
    this.groupId = this.groupId || "";
    this.assetName = this.assetName || "";
    this.assetId = this.assetId || "";
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

  injectContext(masterContractData, contractDetails, priorInits = [], allMasters = []) {
    const parseFinance = (rawVal) => {
      if (typeof rawVal === 'number') return rawVal;
      if (!rawVal || String(rawVal).trim() === "") return 0;
      const cleaned = String(rawVal).replace(/[^0-9.-]/g, '');
      return parseFloat(cleaned) || 0;
    };

    let targetLocalContract = null;
    if (this.contractId && contractDetails && contractDetails.length > 0) {
      // FIX TDD: Gestione mock ID
      targetLocalContract = contractDetails.find(c =>
        String(c.contractId || c.id || c["Contract ID"] || "").trim() === String(this.contractId).trim()
      );
    }

    if (targetLocalContract) {
      this.supplier = targetLocalContract.supplier || targetLocalContract.Supplier || this.supplier;

      // FIX TDD: Fallback su term
      const cTerm = targetLocalContract.contractTerm !== undefined ? targetLocalContract.contractTerm : (targetLocalContract.term !== undefined ? targetLocalContract.term : targetLocalContract["Contract Term (Months)"]);
      this.contractTermMonths = Math.round(parseFloat(cTerm)) || "";
      this.contractTerm = Math.round(parseFloat(cTerm)) || 0;

      // FIX TDD: Fallback su runRate
      const cVal = targetLocalContract.annualValue !== undefined ? targetLocalContract.annualValue : (targetLocalContract.runRate !== undefined ? targetLocalContract.runRate : targetLocalContract["Annual Value"]);
      this.baselineAnnualized = parseFinance(cVal);

      // FIX TDD: Aggiunto fallback per la chiave esatta "Contract End Date" usata nel mock
      const cEnd = targetLocalContract.adjustedEndDate || targetLocalContract.contractEndDate || targetLocalContract.endDate || targetLocalContract["End Date"] || targetLocalContract["Contract End Date"];
      this.lastExpiration = cEnd ? new Date(cEnd) : this.lastExpiration;
      this.expenditureType = targetLocalContract.expenditureType || targetLocalContract["Expenditure Type"] || this.expenditureType;

    } else if (masterContractData) {
      this.supplier = masterContractData.supplier || masterContractData.Supplier || this.supplier;

      // FIX TDD: Fallback su term
      const mTerm = masterContractData.contractTerm !== undefined ? masterContractData.contractTerm : (masterContractData.term !== undefined ? masterContractData.term : masterContractData["Contract Term (Months)"]);
      this.contractTermMonths = Math.round(parseFloat(mTerm)) || "";
      this.contractTerm = Math.round(parseFloat(mTerm)) || 0;

      // FIX TDD: Fallback su annualValue
      const mVal = masterContractData.runRate !== undefined ? masterContractData.runRate : (masterContractData.annualValue !== undefined ? masterContractData.annualValue : masterContractData["Run Rate"]);
      this.baselineAnnualized = parseFinance(mVal);

      const mEnd = masterContractData.masterEndDate || masterContractData["Master End Date"];
      this.lastExpiration = mEnd ? new Date(mEnd) : this.lastExpiration;

      if (contractDetails && contractDetails.length > 0) {
        const child = contractDetails.find(c => (c.masterId || c["Master ID"]) === this.masterId);
        if (child) this.expenditureType = child.expenditureType || child["Expenditure Type"] || this.expenditureType;
      }
    }

    // FIX TDD: OriginalBaseline si allinea ai fallback già calcolati
    let originalBaseline = this.baselineAnnualized;
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

    // ⚡ NUOVA LOGICA "CLOSED-LOOP": Cerca successore per estrarre l'Actual Cost
    if (this.status === "COMPLETED") {
      const strategy = String(this.decision).toUpperCase();
      if (["TERMINATE", "TRANSFER"].includes(strategy)) {
        this.newActual = 0;
      } else if (this.masterId && allMasters && allMasters.length > 0) {
        const successor = allMasters.find(m => (m.previousMasterId || "").includes(this.masterId));
        if (successor) {
          this.newActual = parseFloat(successor.runRate) || 0;
        }
      }
    }

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
      if (this.newActual !== "" && this.newActual !== null && !isNaN(parseFloat(this.newActual))) {
        this.actualSavingAnnualized = this.baselineSpendAnnualized - parseFloat(this.newActual);
      } else {
        this.actualSavingAnnualized = this.targetSavingAnnualized; // Fallback al target se non c'è successore
      }
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