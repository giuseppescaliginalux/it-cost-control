/**
 * ============================================================================
 * FINOPS ENTERPRISE: PAYLOAD BUILDER
 * ============================================================================
 * Assembla e traduce i dati grezzi in DTO puliti.
 */

const PayloadBuilder = {
    GENERIC_MAPS: {
        variance: { "Asset Name": "assetName", "Fiscal Year": "fiscalYear", "Effective Budget": "effectiveBudget", "Variance": "variance" },
        bridge: { "Asset Name": "assetName", "Fiscal Year": "fiscalYear", "Effective Budget": "effectiveBudget", "Allocation Split %": "allocationSplitPct", "Allocation Alias": "allocationAlias", "Valid From": "validFrom", "Valid To": "validTo" },
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

            varianceReport: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.VARIANCE), this.GENERIC_MAPS.variance),
            bridge: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.ASSET_ALLOCATION_BRIDGE), this.GENERIC_MAPS.bridge),
            suppliers: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.SUPPLIERS), this.GENERIC_MAPS.suppliers),
            locations: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.LOCATIONS), this.GENERIC_MAPS.locations),
            costCenters: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.COST_CENTERS), this.GENERIC_MAPS.costCenters),
            legalEntities: this.mapGeneric(getSheetDataAsObjects(CONFIG.SHEETS.LEGAL_ENTITIES), this.GENERIC_MAPS.legalEntities),

            projections: []
        };
    }
};