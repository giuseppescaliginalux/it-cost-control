/**
 * ============================================================================
 * DATA ACCESS LAYER: InitiativesRepository.js
 * ============================================================================
 */

const INITIATIVE_FIELD_MAP = {
  "Initiative ID": "id", "Initiative Name": "name", "Initiative Status": "status",
  "Initial Strategy": "initialStrategy", "Decision": "decision", "Asset Name": "assetName",
  "Master Contract ID": "masterId", "Contract ID": "contractId", "Supplier": "supplier",
  "Baseline (Annualized)": "baselineAnnualized",
  "Contract Term": "contractTerm",
  "Expenditure Type": "expenditureType", "Target Date": "targetDate", "Actual Date": "actualDate",
  "Target Cost (Annualized)": "targetCostAnnualized", "Baseline Spend (Annualized)": "baselineSpendAnnualized",
  "Target Saving (Annualized)": "targetSavingAnnualized", "Target Saving %": "targetSavingPct",
  "New Actual": "newActual", "Actual Saving (Annualized)": "actualSavingAnnualized",
  "Optimization Levers": "optimizationLevers", "Description": "description", "Service Owner": "serviceOwner",
  "Procurement Point": "procurementPoint", "Procurement Point Focal": "procurementPointFocal",
  "Contract Term (Months)": "contractTermMonths", "Last Expiration": "lastExpiration",
  "Tags": "tags", "Notes": "notes", "Quality Check": "qualityCheck"
};

const InitiativeMapper = {
  toDto: (rawRow) => {
    const dto = {};
    const mappedKeys = Object.keys(INITIATIVE_FIELD_MAP);
    const mappedCamelKeys = Object.values(INITIATIVE_FIELD_MAP);
    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
        dto[key] = rawRow[key];
      }
    }
    for (let sheetHeader in INITIATIVE_FIELD_MAP) {
      const camelProp = INITIATIVE_FIELD_MAP[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }
    return dto;
  }
};

class InitiativeRepository {
  constructor() { this.sheetName = CONFIG.SHEETS.INITIATIVES; }
  
  findAllAsDto() {
    const rawData = getSheetDataAsObjects(null, this.sheetName) || [];
    return rawData.map(r => InitiativeMapper.toDto(r));
  }
  
  saveAllBulk(dtosArray) {
    FinOpsDatabase.setObjects(this.sheetName, dtosArray, INITIATIVE_FIELD_MAP, false);
  }
}