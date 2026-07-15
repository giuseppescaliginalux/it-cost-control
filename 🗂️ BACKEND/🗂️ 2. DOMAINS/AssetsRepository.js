/**
 * ============================================================================
 * DATA ACCESS LAYER: AssetsRepository.js
 * ============================================================================
 * Contiene esclusivamente le mappe di traduzione verso Google Sheets, i Mapper
 * e la classe Repository per le operazioni di I/O degli Asset.
 */

const ASSET_FIELD_MAP = {
  "Asset ID": "id",
  "Asset Name": "name",
  "Manufacturer": "manufacturer",
  "Business Driver": "businessDriver",
  "Asset Category": "category",
  "Asset Type": "assetType",
  "Description": "description",
  "Budget Status (FY27)": "budgetStatusFY27",
  "Run Rate": "runRate",
  "Current Status": "currentStatus",
  "Target Status": "targetStatus",
  "Cost Improvement": "costImprovement",
  "Exit Date": "exitDate",
  "Transfer Date": "transferDate",
  "Initiative Target Date": "initiativeTargetDate",
  "Last End Date": "lastEndDate"
};

const AssetMapper = {
  toDto: (rawRow) => {
    const dto = {};
    const mappedKeys = Object.keys(ASSET_FIELD_MAP);
    const mappedCamelKeys = Object.values(ASSET_FIELD_MAP);
    for (let key in rawRow) {
      if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
        dto[key] = rawRow[key];
      }
    }
    for (let sheetHeader in ASSET_FIELD_MAP) {
      const camelProp = ASSET_FIELD_MAP[sheetHeader];
      let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
      dto[camelProp] = val !== undefined && val !== null ? val : "";
    }
    return dto;
  }
};

class AssetRepository {
  constructor() { this.sheetName = CONFIG.SHEETS.ASSETS; }
  
  findAllAsDto() {
    const rawData = getSheetDataAsObjects(null, this.sheetName) || [];
    return rawData.map(r => AssetMapper.toDto(r));
  }
  
  saveAll(dtosArray) {
    FinOpsDatabase.setObjects(this.sheetName, dtosArray, ASSET_FIELD_MAP, false);
  }
}