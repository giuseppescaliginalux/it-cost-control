/**
 * ============================================================================
 * DATA ACCESS LAYER: ContractsRepository.js
 * ============================================================================
 * Contiene esclusivamente le mappe di traduzione verso Google Sheets, i Mapper
 * e la classe Repository per le operazioni di I/O. Fnge da Gatekeeper: scarta
 * i dati estranei e i campi derivati in RAM prima della persistenza.
 */

const MASTER_FIELD_MAP = {
  "Master Contract ID": "masterId", "Previous Master ID": "previousMasterId",
  "Asset Name": "assetName", "Asset ID": "assetId", "Supplier": "supplier",
  "Scope": "masterScope", "Comments": "masterComments", "Contract Links": "contractLinks",
  "Status": "status", "Master Start Date": "masterStartDate", "Master End Date": "masterEndDate",
  "Contract Term (Months)": "contractTerm", "Total Commitment": "totalCommitment",
  "Run Rate": "runRate", "Billing Channel": "billingChannel"
};

const CONTRACT_FIELD_MAP = {
  "Contract ID": "contractId", "Master Contract ID": "masterId", "Legal Entity": "legalEntity",
  "Location": "location", "Service Owner": "serviceOwner", "Scope": "scope", "Billing Frequency": "billingFrequency",
  "Cost Recurrence": "costRecurrence", "Pricing Model": "pricingModel", "Billing Terms": "billingTerms",
  "Total Commitment": "totalCommitment", "Expenditure Type": "expenditureType", "Cost Center": "costCenter",
  "Start Date": "startDate", "Contract End Date": "contractEndDate", "Adjusted End Date": "adjustedEndDate",
  "End Date": "endDate", "Notice Period (Days)": "noticePeriod", "Auto-Renewal": "autoRenewal",
  "BL ID": "blId", "Request Code": "requestCode", "Comments": "comments", "Contract Links": "contractLinks",
  "Status": "status", "Contract Term (Months)": "contractTerm",
  "Annual Value": "annualValue", "Asset Name": "assetName", "Supplier": "supplier", "Billing Channel": "billingChannel"
};

const SPLIT_FIELD_MAP = {
  "Split ID": "splitId", "Contract ID": "contractId", "Target Legal Entity": "targetLegalEntity",
  "Target Cost Center": "targetCostCenter", "Allocation Rule": "allocationRule",
  "Percentage Share": "percentageShare", "Fixed Amount": "fixedAmount",
  "Units Assigned": "unitsAssigned", "Valid From": "validFrom", "Valid To": "validTo", "Notes": "notes"
};

const LEDGER_FIELD_MAP = {
  "Contract ID": "contractId", "Start Date": "startDate", "End Date": "endDate",
  "Type": "type", "Amount": "amount", "Notes": "notes"
};

const ContractMapper = {
  toDto: (rawRow, fieldMap) => {
    const dto = {};
    const mappedKeys = Object.keys(fieldMap);
    const mappedCamelKeys = Object.values(fieldMap);
    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
        dto[key] = rawRow[key];
      }
    }
    for (let sheetHeader in fieldMap) {
      const camelProp = fieldMap[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }
    return dto;
  }
};

class ContractRepository {
  // Scritture
  saveMasterRow(masterDto) { FinOpsDatabase.updateOrAppendRowByColumnValue(CONFIG.SHEETS.MASTER_CONTRACTS, "Master Contract ID", masterDto.masterId, masterDto, MASTER_FIELD_MAP); }
  saveDetailsCollection(masterId, detailsDtoArray) {
    const ctx = FinOpsDatabase.getContext(CONFIG.SHEETS.CONTRACTS);
    const colIdx = ctx.headers.indexOf("Master Contract ID");
    const filteredData = [ctx.headers];
    for (let i = 1; i < ctx.data.length; i++) {
      if (String(ctx.data[i][colIdx]).trim() !== String(masterId).trim()) filteredData.push(ctx.data[i]);
    }
    ctx.data = filteredData;
    FinOpsDatabase.setObjects(CONFIG.SHEETS.CONTRACTS, detailsDtoArray, CONTRACT_FIELD_MAP, true);
  }
  wipeAndWriteSplits(contractIds, splitsDtoArray) {
    FinOpsDatabase.deleteRowsByColumnValue(CONFIG.SHEETS.ALLOCATION_SPLITS, "Contract ID", contractIds);
    FinOpsDatabase.setObjects(CONFIG.SHEETS.ALLOCATION_SPLITS, splitsDtoArray, SPLIT_FIELD_MAP, true);
  }
  wipeAndWriteLedger(contractIds, ledgerDtoArray) {
    FinOpsDatabase.deleteRowsByColumnValue(CONFIG.SHEETS.LEDGER, "Contract ID", contractIds);
    FinOpsDatabase.setObjects(CONFIG.SHEETS.LEDGER, ledgerDtoArray, LEDGER_FIELD_MAP, true);
  }
  overwriteAllMasters(mastersArray) { FinOpsDatabase.setObjects(CONFIG.SHEETS.MASTER_CONTRACTS, mastersArray, MASTER_FIELD_MAP, false); }
  overwriteAllContracts(contractsArray) { FinOpsDatabase.setObjects(CONFIG.SHEETS.CONTRACTS, contractsArray, CONTRACT_FIELD_MAP, false); }
  overwriteAllSplits(splitsArray) { FinOpsDatabase.setObjects(CONFIG.SHEETS.ALLOCATION_SPLITS, splitsArray, SPLIT_FIELD_MAP, false); }
  overwriteAllLedger(ledgerArray) { FinOpsDatabase.setObjects(CONFIG.SHEETS.LEDGER, ledgerArray, LEDGER_FIELD_MAP, false); }

  // Letture Integrate (Isolano SpreadsheetApp dal Dominio)
  findAllMasters() {
    const raw = getSheetDataAsObjects(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    return raw.map(r => ContractMapper.toDto(r, MASTER_FIELD_MAP));
  }
  findAllContracts() {
    const raw = getSheetDataAsObjects(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEETS.CONTRACTS) || [];
    return raw.map(r => ContractMapper.toDto(r, CONTRACT_FIELD_MAP));
  }
  findAllSplits() {
    const raw = getSheetDataAsObjects(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEETS.ALLOCATION_SPLITS) || [];
    return raw.map(r => ContractMapper.toDto(r, SPLIT_FIELD_MAP));
  }
  findAllLedger() {
    const raw = getSheetDataAsObjects(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEETS.LEDGER) || [];
    return raw.map(r => ContractMapper.toDto(r, LEDGER_FIELD_MAP));
  }
  findAllInitiativesAsDomain() {
    const raw = getSheetDataAsObjects(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEETS.INITIATIVES) || [];
    return raw.map(r => ({
      masterId: r["Master Contract ID"] || r.masterId || "",
      status: r["Initiative Status"] || r.status || "",
      decision: r["Decision"] || r.decision || ""
    }));
  }
}