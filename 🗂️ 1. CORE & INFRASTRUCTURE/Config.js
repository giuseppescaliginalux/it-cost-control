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
    VARIANCE: "AssetVarianceReport",
    PROJECTIONS: "FiscalProjections"
  },
  
  // Impostazioni regionali e temporali
  TIMEZONE: Session.getScriptTimeZone() || "Europe/Rome"
};
