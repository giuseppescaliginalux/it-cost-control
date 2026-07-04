/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: INITIATIVES DOMAIN (CONSERVATIVE BULK)
 * ============================================================================
 */

// ============================================================================
// 1. DOMAIN ENTITIES (Oggetti di Dominio Intelligenti)
// ============================================================================

/**
 * @class Initiative
 * @description Gestisce i risparmi senza distruggere i metadati anagrafici circostanti.
 */
class Initiative {
  constructor(rawData) {
    this.id = rawData["Initiative ID"] || rawData.initiativeId || "";
    this.masterId = rawData["Master Contract ID"] || rawData.masterId || "";
    this.name = rawData["Initiative Name"] || rawData.initiativeName || "";
    this.status = String(rawData["Initiative Status"] || rawData.initiativeStatus || "PLANNED").toUpperCase();
    this.decision = String(rawData["Decision"] || rawData.decision || "").toUpperCase();
    
    this.targetDate = rawData["Target Date"] || rawData.targetDate ? new Date(rawData["Target Date"] || rawData.targetDate) : null;
    this.actualDate = rawData["Actual Date"] || rawData.actualDate ? new Date(rawData["Actual Date"] || rawData.actualDate) : null;
    
    this.targetSavingPct = rawData["Target Saving %"] !== undefined ? parseFloat(rawData["Target Saving %"]) : parseFloat(rawData.targetSavingPct) || 0;
    this.notes = rawData["Notes"] || rawData.notes || "";
    
    // Campi finanziari calcolati ereditati dal Master Contract
    this.baselineRunRate = parseFloat(rawData["Baseline Run Rate (Current Master)"] || rawData.baselineRunRate) || 0;
    
    // Manteniamo una copia esatta dell'intera riga originale per preservare le colonne non toccate dal motore
    this._raw = rawData;
  }

  injectMasterContext(masterContractData) {
    if (!masterContractData) return;
    this.baselineRunRate = parseFloat(masterContractData.runRate || 0);
  }

  getTargetSavingAmount() {
    // Gestione percentuale sia come decimale (0.20) che come intero (20)
    const pct = this.targetSavingPct > 1 ? this.targetSavingPct / 100 : this.targetSavingPct;
    return parseFloat((this.baselineRunRate * pct).toFixed(2));
  }

  getOptimizedRunRate() {
    return parseFloat((this.baselineRunRate - this.getTargetSavingAmount()).toFixed(2));
  }

  getEffectiveDate() {
    return (this.actualDate && !isNaN(this.actualDate.getTime())) ? this.actualDate : this.targetDate;
  }

  /**
   * Esporta il DTO fondendo i vecchi dati anagrafici con i nuovi calcoli finanziari.
   * Mappa le chiavi esattamente come si chiamano le colonne sul foglio Excel.
   */
  exportToData() {
    const pct = this.targetSavingPct > 1 ? this.targetSavingPct / 100 : this.targetSavingPct;
    
    return {
      ...this._raw, // Conserva intatti Asset Name, Supplier, Tags, Service Owner, Quality Check, ecc.
      "Initiative ID": this.id,
      "Master Contract ID": this.masterId,
      "Initiative Name": this.name,
      "Initiative Status": this.status,
      "Decision": this.decision,
      "Target Date": formatServerDate(this.targetDate),
      "Actual Date": formatServerDate(this.actualDate),
      "Target Saving %": pct,
      "Baseline Run Rate (Current Master)": this.baselineRunRate, // Mappa sul tuo campo di riferimento
      "Target Saving Amount": this.getTargetSavingAmount(),
      "Optimized Run Rate": this.getOptimizedRunRate(),
      "Notes": this.notes
    };
  }
}

// ============================================================================
// 2. DATA ACCESS LAYER (REPOSITORY)
// ============================================================================

class InitiativeRepository {
  constructor() {
    this.sheetName = CONFIG.SHEETS.INITIATIVES;
  }
  
  /**
   * Scrive in bulk proiettando i dati mappati sul set di intestazioni reali del foglio.
   */
  saveAllBulk(initiativesDataArray) {
    const ctx = getSheetContext(this.sheetName);
    if (!ctx.sheet) throw new Error("Initiatives sheet infrastructure missing.");
    if (initiativesDataArray.length === 0) return;

    // Generiamo la matrice di righe allineata dinamicamente all'ordine delle tue colonne attuali
    const rows = initiativesDataArray.map(initData => {
      return ctx.headers.map(h => {
        let val = initData[h];
        return val !== undefined && val !== null ? val : "";
      });
    });

    // Pulisce l'area dati mantenendo la formattazione e l'header
    if (ctx.sheet.getLastRow() > 1) {
      ctx.sheet.getRange(2, 1, ctx.sheet.getLastRow() - 1, ctx.headers.length).clearContent();
    }
    
    // Scrittura Bulk O(1) atomica
    ctx.sheet.getRange(2, 1, rows.length, ctx.headers.length).setValues(rows);
    console.log(`INITIATIVE REPOSITORY: Sincronizzazione Bulk completata per ${rows.length} righe preservando le colonne.`);
  }
}

// ============================================================================
// 3. BUSINESS LOGIC LAYER (SERVICE)
// ============================================================================

class InitiativeService {
  constructor() {
    this.repository = new InitiativeRepository();
  }

  processAndSync(rawInitiativesArray) {
    console.log("INITIATIVE DOMAIN: Elaborazione conservativa...");
    if (!rawInitiativesArray || !Array.isArray(rawInitiativesArray)) return "SUCCESS";

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allInitsInDb = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];

    let currentGlobalCount = allInitsInDb.length;
    const finalExportedPayloads = [];

    rawInitiativesArray.forEach(rawInit => {
      const initiative = new Initiative(rawInit);
      
      const parentMaster = activeMasters.find(m => String(m.masterId || m["Master Contract ID"]).trim() === String(initiative.masterId).trim());
      if (parentMaster) {
        initiative.injectMasterContext(parentMaster);
      }

      if (!initiative.id) {
        currentGlobalCount++;
        const padCount = currentGlobalCount < 10 ? "0" + currentGlobalCount : currentGlobalCount;
        initiative.id = `INC-FIN-${new Date().getFullYear()}-${padCount}`;
      }

      finalExportedPayloads.push(initiative.exportToData());
    });

    this.repository.saveAllBulk(finalExportedPayloads);
    return "SUCCESS";
  }

  forceRecalculateAll() {
    console.log("INITIATIVE DOMAIN: Avvio ricalcolo massivo preservando l'anagrafe...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
    
    if (allInits.length === 0) return;

    // Passiamo gli oggetti nativi letti completi di TUTTE le colonne a processAndSync
    this.processAndSync(allInits);
  }
}

const InitiativeDomain = new InitiativeService();