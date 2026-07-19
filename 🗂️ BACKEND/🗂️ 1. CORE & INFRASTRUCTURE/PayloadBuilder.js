/**
 * ============================================================================
 * FINOPS ENTERPRISE: PAYLOAD BUILDER
 * ============================================================================
 * Assembla e traduce i dati grezzi in DTO puliti.
 */

const PayloadBuilder = {
    GENERIC_MAPS: {
        // Nuova mappa per il foglio Allocations normalizzato (con importi in verticale)
        allocations: {
            "Allocation ID": "allocationId",
            "Allocation Name": "allocationName",
            "Description": "description",
            "Supplier": "supplier",
            "Legal Entity": "legalEntity",
            "Cost Center": "costCenter",
            "Expenditure Type": "expenditureType",
            "Fiscal Year": "fiscalYear",
            "Amount": "amount"
        },
        // Mappa Bridge ripulita: usa ID, Anno Fiscale e Filtro (niente importi o %)
        bridge: {
            "Allocation ID": "allocationId",
            "Asset ID": "assetId",
            "Fiscal Year": "fiscalYear",
            "Valid From": "validFrom",
            "Valid To": "validTo",
            "Target Expenditure Type": "targetExpenditureType",
            "Comments": "comments"
        },
        suppliers: { "Supplier": "supplier", "Billing Channel": "billingChannel" },
        locations: { "Location": "location" },
        costCenters: { "Cost Center": "costCenter" },
        legalEntities: { "Legal Entity": "legalEntity" }
    },

    mapGeneric: function (rawArray, fieldMap) {
        return rawArray.map(row => {
            const dto = {};
            for (let key in row) {
                dto[fieldMap[key] || key] = row[key];
            }
            return dto;
        });
    },

    buildFullPayload: function () {
        const contractRepo = new ContractRepository();
        const assetRepo = new AssetRepository();
        const initRepo = new InitiativeRepository();

        return {
            masterContracts: contractRepo.findAllMasters(),
            contracts: contractRepo.findAllContracts(),
            allocationSplits: contractRepo.findAllSplits(),
            ledger: contractRepo.findAllLedger(),
            assets: assetRepo.findAllAsDto(),
            initiatives: initRepo.findAllAsDto(),

            // Estrazione dei nuovi fogli per il motore di Budgeting
            allocations: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.ALLOCATIONS), this.GENERIC_MAPS.allocations),
            bridge: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.ASSET_ALLOCATION_BRIDGE), this.GENERIC_MAPS.bridge),

            suppliers: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.SUPPLIERS), this.GENERIC_MAPS.suppliers),
            locations: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.LOCATIONS), this.GENERIC_MAPS.locations),
            costCenters: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.COST_CENTERS), this.GENERIC_MAPS.costCenters),
            legalEntities: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.LEGAL_ENTITIES), this.GENERIC_MAPS.legalEntities),

            projections: []
            // varianceReport è SPARITO. Il client lo calcolerà da solo usando allocations, bridge e projections.
        };
    }
};