/**
 * ============================================================================
 * PayloadBuilder.js
 * SERVICE: Si occupa esclusivamente di assemblare e tradurre i dati grezzi 
 * in DTO (Data Transfer Objects) puliti prima di spedirli al client.
 * ============================================================================
 */

const PayloadBuilder = {
    
    // Mappe di traduzione per le tabelle generiche minori (Lookup)
    GENERIC_MAPS: {
        variance: { "Asset Name": "assetName", "Fiscal Year": "fiscalYear", "Effective Budget": "effectiveBudget", "Variance": "variance" },
        bridge: { "Asset Name": "assetName", "Fiscal Year": "fiscalYear", "Effective Budget": "effectiveBudget", "Allocation Split %": "allocationSplitPct", "Allocation Alias": "allocationAlias", "Valid From": "validFrom", "Valid To": "validTo" },
        suppliers: { "Supplier": "supplier", "Billing Channel": "billingChannel" },
        locations: { "Location": "location" },
        costCenters: { "Cost Center": "costCenter" },
        legalEntities: { "Legal Entity": "legalEntity" }
    },

    /**
     * Mappatore generico per le tabelle di appoggio
     */
    mapGeneric: function(rawArray, fieldMap) {
        return rawArray.map(row => {
            const dto = {};
            for (let key in row) {
                const camelKey = fieldMap[key] || key;
                dto[camelKey] = row[key];
            }
            return dto;
        });
    },

    /**
     * Assembla il pacchetto dati completo per l'avvio dell'applicazione
     */
    buildFullPayload: function(ss) {
        console.log("PAYLOAD BUILDER: Traduzione dati grezzi in DTO puliti...");

        // 1. Estrazione dati grezzi dal Database
        const rawMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
        const rawContracts = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];
        const rawInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
        const rawLedger = getSheetDataAsObjects(ss, CONFIG.SHEETS.LEDGER) || [];
        const rawSplits = getSheetDataAsObjects(ss, CONFIG.SHEETS.ALLOCATION_SPLITS) || [];
        const rawAssets = getSheetDataAsObjects(ss, CONFIG.SHEETS.ASSETS) || [];
        
        const rawVariance = getSheetDataAsObjects(ss, CONFIG.SHEETS.VARIANCE) || [];
        const rawBridge = getSheetDataAsObjects(ss, CONFIG.SHEETS.ASSET_ALLOCATION_BRIDGE) || [];
        const rawSuppliers = getSheetDataAsObjects(ss, CONFIG.SHEETS.SUPPLIERS) || [];
        const rawLocations = getSheetDataAsObjects(ss, CONFIG.SHEETS.LOCATIONS) || [];
        const rawCostCenters = getSheetDataAsObjects(ss, CONFIG.SHEETS.COST_CENTERS) || [];
        const rawLegalEntities = getSheetDataAsObjects(ss, CONFIG.SHEETS.LEGAL_ENTITIES) || [];

        // 2. Mappatura attraverso i Domain Mappers ufficiali (Matematica Sicura)
        return {
            masterContracts: rawMasters.map(r => ContractMapper.toDto(r, MASTER_FIELD_MAP)),
            contracts: rawContracts.map(r => ContractMapper.toDto(r, CONTRACT_FIELD_MAP)),
            initiatives: rawInits.map(r => InitiativeMapper.toDto(r)),
            ledger: rawLedger.map(r => ContractMapper.toDto(r, LEDGER_FIELD_MAP)),
            allocationSplits: rawSplits.map(r => ContractMapper.toDto(r, SPLIT_FIELD_MAP)),
            assets: rawAssets.map(r => AssetMapper.toDto(r)),
            
            // 3. Mappatura tabelle generiche
            varianceReport: this.mapGeneric(rawVariance, this.GENERIC_MAPS.variance),
            bridge: this.mapGeneric(rawBridge, this.GENERIC_MAPS.bridge),
            suppliers: this.mapGeneric(rawSuppliers, this.GENERIC_MAPS.suppliers),
            locations: this.mapGeneric(rawLocations, this.GENERIC_MAPS.locations),
            costCenters: this.mapGeneric(rawCostCenters, this.GENERIC_MAPS.costCenters),
            legalEntities: this.mapGeneric(rawLegalEntities, this.GENERIC_MAPS.legalEntities),
            
            projections: [] // Saranno calcolate lato client in RAM come sempre
        };
    }
};