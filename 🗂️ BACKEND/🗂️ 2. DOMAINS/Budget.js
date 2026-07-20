/**
 * ============================================================================
 * FINOPS PURE DOMAIN: Budget (Allocations & Bridges)
 * ============================================================================
 * Entità di dominio isomorfiche (Client/Server). Ignorano totalmente
 * l'esistenza di Google Sheets, agendo come guardiani del tipo di dato (Type Safety).
 */

class Allocation {
    constructor(data = {}) {
        Object.assign(this, data);

        // Tolleranza Zero: normalizzazione rigorosa dei tipi e degli spazi
        this.allocationId = String(this.allocationId || this.id || "").trim();
        this.allocationName = String(this.allocationName || "").trim();
        this.description = String(this.description || "").trim();

        // Coordinate Finanziarie (Filtri per l'Engine)
        this.supplier = String(this.supplier || "").trim();
        this.legalEntity = String(this.legalEntity || "").trim();
        this.costCenter = String(this.costCenter || "").trim();
        this.expenditureType = String(this.expenditureType || "").trim();

        // Dati Quantitativi
        this.fiscalYear = String(this.fiscalYear || "").trim().toUpperCase();

        // Cast rigoroso a Float per evitare errori matematici
        this.amount = parseFloat(this.amount) || 0;
    }

    exportToData() {
        return {
            ...this
        };
    }
}

class AssetAllocationBridge {
    constructor(data = {}) {
        Object.assign(this, data);

        // Relazioni
        this.allocationId = String(this.allocationId || "").trim();
        this.assetId = String(this.assetId || "").trim();
        this.fiscalYear = String(this.fiscalYear || "").trim().toUpperCase();

        // Conversione sicura in oggetti Date
        this.validFrom = this.validFrom ? new Date(this.validFrom) : null;
        this.validTo = this.validTo ? new Date(this.validTo) : null;

        this.comments = String(this.comments || "").trim();
    }

    exportToData() {
        return {
            ...this,
            // Utilizza la funzione globale di ecosistema per esportare date ISO pulite
            validFrom: formatServerDate(this.validFrom),
            validTo: formatServerDate(this.validTo)
        };
    }
}