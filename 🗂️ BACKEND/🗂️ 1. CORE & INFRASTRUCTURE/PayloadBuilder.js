/**
 * ============================================================================
 * FINOPS ENTERPRISE: PAYLOAD BUILDER
 * ============================================================================
 * Assembla e traduce i dati grezzi in DTO puliti.
 */
const PayloadBuilder = {

    buildFullPayload: function () {
        const contractRepo = new ContractRepository();
        const assetRepo = new AssetRepository();
        const initRepo = new InitiativeRepository();
        const budgetRepo = new BudgetRepository();
        const masterDataRepo = new MasterDataRepository();

        return {
            masterContracts: contractRepo.findAllMasters(),
            contracts: contractRepo.findAllContracts(),
            allocationSplits: contractRepo.findAllSplits(),
            ledger: contractRepo.findAllLedger(),
            assets: assetRepo.findAllAsDto(),
            initiatives: initRepo.findAllAsDto(),
            allocations: budgetRepo.findAllAllocations().map(a => a.exportToData()),
            bridge: budgetRepo.findAllBridges().map(b => b.exportToData()),

            // [NEW DIRETTO] Caricamento tramite metodi DTO della Repository isolata
            suppliers: masterDataRepo.findAllSuppliers(),
            legalEntities: masterDataRepo.findAllLegalEntities(),
            costCenters: masterDataRepo.findAllCostCenters(),
            locations: masterDataRepo.findAllLocations(),
            deliveryModels: masterDataRepo.findAllDeliveryModels(),
            optimizationLevers: masterDataRepo.findAllOptimizationLevers(),
            assetCategories: masterDataRepo.findAllAssetCategories(),
            currencyExchangeRates: masterDataRepo.findAllCurrencyExchangeRates(),
            projections: []
        };
    }
};