/**
 * ============================================================================
 * DATA ACCESS LAYER: BudgetRepository.js
 * ============================================================================
 * Gestisce l'accesso fisico ai dati di Budget su Google Sheets, isolando 
 * il Dominio dalle specificità del database.
 */

const ALLOCATION_FIELD_MAP = {
    "Allocation ID": "allocationId",
    "Allocation Name": "allocationName",
    "Description": "description",
    "Supplier": "supplier",
    "Legal Entity": "legalEntity",
    "Cost Center": "costCenter",
    "Expenditure Type": "expenditureType",
    "Fiscal Year": "fiscalYear",
    "Amount": "amount"
};

const BRIDGE_FIELD_MAP = {
    "Allocation ID": "allocationId",
    "Asset ID": "assetId",
    "Fiscal Year": "fiscalYear",
    "Valid From": "validFrom",
    "Valid To": "validTo",
    "Comments": "comments"
};

const BudgetMapper = {
    toDto: (rawRow, fieldMap) => {
        const dto = {};
        const mappedKeys = Object.keys(fieldMap);
        const mappedCamelKeys = Object.values(fieldMap);

        // 1. Preserva eventuali colonne extra (Data Preservation)
        for (let key in rawRow) {
            if (!mappedKeys.includes(key) && !mappedCamelKeys.includes(key)) {
                dto[key] = rawRow[key];
            }
        }

        // 2. Traduzione verso proprietà camelCase
        for (let sheetHeader in fieldMap) {
            const camelProp = fieldMap[sheetHeader];
            let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
            dto[camelProp] = val !== undefined && val !== null ? val : "";
        }

        return dto;
    }
};

class BudgetRepository {
    // ---- Letture Integrate ----

    findAllAllocations() {
        const raw = getSheetDataAsObjects(null, CONFIG.SHEETS.ALLOCATIONS) || [];
        return raw.map(r => new Allocation(BudgetMapper.toDto(r, ALLOCATION_FIELD_MAP)));
    }

    findAllBridges() {
        const raw = getSheetDataAsObjects(null, CONFIG.SHEETS.ASSET_ALLOCATION_BRIDGE) || [];
        return raw.map(r => new AssetAllocationBridge(BudgetMapper.toDto(r, BRIDGE_FIELD_MAP)));
    }

    // ---- Scritture Massive (Predisposizione per il salvataggio dal Client) ----

    overwriteAllAllocations(allocationsArray) {
        FinOpsDatabase.setObjects(CONFIG.SHEETS.ALLOCATIONS, allocationsArray, ALLOCATION_FIELD_MAP, false);
    }

    overwriteAllBridges(bridgesArray) {
        FinOpsDatabase.setObjects(CONFIG.SHEETS.ASSET_ALLOCATION_BRIDGE, bridgesArray, BRIDGE_FIELD_MAP, false);
    }
}