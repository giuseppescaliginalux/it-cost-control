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
    MASTER_CONTRACTS: "Master Contracts",
    CONTRACTS: "Contracts",
    INITIATIVES: "Initiatives",
    LEDGER: "Ledger",
    ALLOCATION_SPLITS: "Allocation Splits",
    ASSETS: "Assets",
    VARIANCE: "AssetVarianceReport",
    PROJECTIONS: "FiscalProjections"
  },
  
  // Impostazioni regionali e temporali
  TIMEZONE: Session.getScriptTimeZone() || "Europe/Rome"
};

// --- MAPPATURE COLONNE (FIELD MAPS) PER IL PATTERN DTO ---
// Traducono le intestazioni di Google Sheets (chiavi) nelle proprietà CamelCase del Client (valori)

const MASTER_FIELD_MAP = {
  "Master Contract ID": "masterId",
  "Supplier": "supplier",
  "Scope": "masterScope",
  "Comments": "masterComments",
  "Contract Links": "contractLinks",
  "Status": "status",
  "Master Start Date": "masterStartDate",
  "Master End Date": "masterEndDate",
  "Contract Term (Months)": "contractTerm",
  "Total Commitment": "totalCommitment",
  "Run Rate (Annualized)": "runRate",
  "Billing Channel": "billingChannel"
};

const CONTRACT_FIELD_MAP = {
  "Contract ID": "contractId",
  "Master Contract ID": "masterId",
  "Legal Entity": "legalEntity",
  "Location": "location",
  "Service Owner": "serviceOwner",
  "Scope": "scope",
  "Cost Recurrence": "costRecurrence",
  "Pricing Model": "pricingModel",
  "Billing Terms": "billingTerms",
  "Total Commitment": "totalCommitment",
  "Expenditure Type": "expenditureType",
  "Cost Center": "costCenter",
  "Start Date": "startDate",
  "Contract End Date": "contractEndDate",
  "Adjusted End Date": "adjustedEndDate",
  "End Date": "endDate",
  "Notice Period (Days)": "noticePeriod",
  "Auto-Renewal": "autoRenewal",
  "BL ID": "blId",
  "Request Code": "requestCode",
  "Comments": "comments",
  "Contract Links": "contractLinks",
  "Status": "status",
  "Contract Term (Months)": "contractTerm",
  "Effective Commitment": "effectiveCommitment",
  "Annual Value": "annualValue",
  "Asset Name": "assetName",
  "Supplier": "supplier",
  "Billing Channel": "billingChannel"
};

// --- ARRAYS DI EDITABILITÀ ---
// Definiscono quali campi possono essere sovrascritti dai salvataggi della UI
const EDITABLE_MASTER = ["Supplier", "Scope", "Comments", "Contract Links"];
const EDITABLE_CONTRACTS = [
  "Legal Entity", "Location", "Service Owner", "Scope", "Cost Recurrence", 
  "Pricing Model", "Billing Terms", "Total Commitment", "Expenditure Type", 
  "Cost Center", "Start Date", "Contract End Date", "Adjusted End Date", 
  "Notice Period (Days)", "Auto-Renewal", "BL ID", "Request Code", "Comments", "Contract Links"
];