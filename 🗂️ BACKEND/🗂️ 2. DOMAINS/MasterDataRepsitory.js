/**
 * ============================================================================
 * DATA ACCESS LAYER: MasterDataRepository.js
 * ============================================================================
 * Funge da Gatekeeper per le LookUp Tables anagrafiche. Gestisce la traduzione 
 * bidirezionale dei DTO in camelCase da/verso i fogli fisici di Google Sheets.
 */

const MASTER_DATA_MAPS = {
    suppliers: { "Supplier ID": "supplierId", "Supplier": "supplier", "Type": "type" },
    legalEntities: { "Legal Entity": "legalEntity" },
    costCenters: { "Cost Center": "costCenter" },
    locations: { "Location": "location", "Country": "country" },
    deliveryModels: { "Delivery Model": "deliveryModel", "Asset Type": "assetType", "Description": "description" },
    optimizationLevers: { "Lever": "lever", "Description": "description" },
    assetCategories: { "Category": "category", "Description": "description" },
    currencyExchangeRates: { "MonthYear": "monthYear", "EUR": "eur", "USD": "usd", "GBP": "gbp", "HKD": "hkd" }
};

const MasterDataMapper = {
    toDto: (rawRow, fieldMap) => {
        const dto = {};
        for (let sheetHeader in fieldMap) {
            const camelProp = fieldMap[sheetHeader];
            let val = rawRow[sheetHeader] !== undefined ? rawRow[sheetHeader] : rawRow[camelProp];
            dto[camelProp] = val !== undefined && val !== null ? val : "";
        }
        return dto;
    }
};

class MasterDataRepository {
    // ---- METODI DI LETTURA (Estraggono i DTO puliti in camelCase per il PayloadBuilder) ----
    findAllSuppliers() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.SUPPLIERS) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.suppliers));
    }
    findAllLegalEntities() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.LEGAL_ENTITIES) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.legalEntities));
    }
    findAllCostCenters() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.COST_CENTERS) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.costCenters));
    }
    findAllLocations() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.LOCATIONS) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.locations));
    }
    findAllDeliveryModels() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.DELIVERY_MODELS) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.deliveryModels));
    }
    findAllOptimizationLevers() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.OPTIMIZATION_LEVERS) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.optimizationLevers));
    }
    findAllAssetCategories() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.ASSET_CATEGORIES) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.assetCategories));
    }
    findAllCurrencyExchangeRates() {
        return (FinOpsDatabase.getObjects(CONFIG.SHEETS.CURRENCY_EXCHANGE_RATES) || []).map(r => MasterDataMapper.toDto(r, MASTER_DATA_MAPS.currencyExchangeRates));
    }

    // ---- METODI DI SCRITTURA BULK (Accettano DTO camelCase dal client e convertono per le tabelle) ----
    overwriteSuppliers(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.SUPPLIERS, dtos, MASTER_DATA_MAPS.suppliers, false); }
    overwriteLegalEntities(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.LEGAL_ENTITIES, dtos, MASTER_DATA_MAPS.legalEntities, false); }
    overwriteCostCenters(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.COST_CENTERS, dtos, MASTER_DATA_MAPS.costCenters, false); }
    overwriteLocations(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.LOCATIONS, dtos, MASTER_DATA_MAPS.locations, false); }
    overwriteDeliveryModels(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.DELIVERY_MODELS, dtos, MASTER_DATA_MAPS.deliveryModels, false); }
    overwriteOptimizationLevers(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.OPTIMIZATION_LEVERS, dtos, MASTER_DATA_MAPS.optimizationLevers, false); }
    overwriteAssetCategories(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.ASSET_CATEGORIES, dtos, MASTER_DATA_MAPS.assetCategories, false); }
    overwriteCurrencyExchangeRates(dtos) { FinOpsDatabase.setObjects(CONFIG.SHEETS.CURRENCY_EXCHANGE_RATES, dtos, MASTER_DATA_MAPS.currencyExchangeRates, false); }
}

const MasterDataDomain = new MasterDataRepository();