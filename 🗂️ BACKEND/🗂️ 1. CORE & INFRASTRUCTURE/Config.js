/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: CORE CONFIGURATION
 * ============================================================================
 * Centralizza tutte le costanti, mappature e configurazioni dell'ecosistema.
 * ============================================================================
 */

const CONFIG = {
  // Nomi ufficiali dei fogli sul database Google Sheets
  SHEETS: {
    MASTER_CONTRACTS: "MasterContracts",
    CONTRACTS: "Contracts",
    INITIATIVES: "Initiatives",
    LEDGER: "Ledger",
    ALLOCATION_SPLITS: "AllocationSplits",
    ASSETS: "Assets",
    ALLOCATIONS: "Allocations",
    ASSET_ALLOCATION_BRIDGE: "AssetAllocationBridge",
    SUPPLIERS: "Suppliers",
    LOCATIONS: "Locations",
    COST_CENTERS: "CostCenters",
    LEGAL_ENTITIES: "LegalEntities",
    DELIVERY_MODELS: "DeliveryModels",
    OPTIMIZATION_LEVERS: "OptimizationLevers",
    ASSET_CATEGORIES: "AssetCategories",
    CURRENCY_EXCHANGE_RATES: "CurrencyExchangeRates"
  },

  // Impostazioni regionali e temporali
  TIMEZONE: Session.getScriptTimeZone() || "Europe/Rome"
};
