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
      targetLocalContract = contractDetails.find(c => String(c.contractId).trim() === String(this.contractId).trim());
    }

    if (targetLocalContract) {
      this.supplier = targetLocalContract.supplier || this.supplier;
      this.contractTermMonths = Math.round(parseFloat(targetLocalContract.contractTerm)) || "";
      this.contractTerm = Math.round(parseFloat(targetLocalContract.contractTerm)) || 0;
      this.baselineAnnualized = parseFinance(targetLocalContract.annualValue);

      const cEnd = targetLocalContract.adjustedEndDate || targetLocalContract.contractEndDate || targetLocalContract.endDate;
      this.lastExpiration = cEnd ? new Date(cEnd) : this.lastExpiration;
      this.expenditureType = targetLocalContract.expenditureType || this.expenditureType;

    } else if (masterContractData) {
      this.supplier = masterContractData.supplier || this.supplier;
      this.contractTermMonths = Math.round(parseFloat(masterContractData.contractTerm)) || "";
      this.contractTerm = Math.round(parseFloat(masterContractData.contractTerm)) || 0;
      this.baselineAnnualized = parseFinance(masterContractData.runRate);

      this.lastExpiration = masterContractData.masterEndDate ? new Date(masterContractData.masterEndDate) : this.lastExpiration;
      if (contractDetails && contractDetails.length > 0) {
        const child = contractDetails.find(c => c.masterId === this.masterId);
        if (child) this.expenditureType = child.expenditureType || this.expenditureType;
      }
    }

    let originalBaseline = targetLocalContract ? parseFinance(targetLocalContract.annualValue) : (masterContractData ? parseFinance(masterContractData.runRate) : 0);
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