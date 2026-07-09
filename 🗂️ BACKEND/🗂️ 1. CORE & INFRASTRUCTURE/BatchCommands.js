/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: BATCH COMMANDS & MAINTENANCE MACROS
 * ============================================================================
 * Catalogo delle operazioni massive eseguibili da trigger o interfaccia GAS.
 * Applica l'orchestrazione topologica interrogando esclusivamente i Domini.
 * ============================================================================
 */

/**
 * MACRO MANUALE 1: Ricalcola l'intera infrastruttura contrattuale (Master e Dettagli).
 * Da lanciare se tocchi a mano le righe dei contratti o dei costi sul foglio Excel.
 */
function batchRecalculateContractsEcosystem() {
  console.log("=== BATCH: AVVIO RICALCOLO COMPLETO CONTRATTI ===");

  // Chiama il servizio contratti per rileggere, ricalcolare e sovrascrivere in modo coerente
  ContractDomain.forceRecalculateAll();

  // Sincronizza a cascata le iniziative (le cui baseline dipendono dai contratti modificati)
  InitiativeDomain.forceRecalculateAll();

  // Aggiorna le proiezioni temporali finali
  ProjectionDomain.recalculateAll();

  FinOpsDatabase.commit();

  console.log("=== BATCH: RICALCOLO CONTRATTI COMPLETATO CON SUCCESSO ===");
}

/**
 * MACRO MANUALE 2: Ricalcola e normalizza il foglio delle Iniziative.
 * Da lanciare se modifichi a mano le percentuali di target o lo status delle iniziative a schermo.
 */
function batchRecalculateInitiativesOnly() {
  console.log("=== BATCH: AVVIO RICALCOLO SELETTIVO INIZIATIVE ===");

  // Delega interamente al dominio proprietario
  InitiativeDomain.forceRecalculateAll();

  // Rinfresca lo scenario finanziario ottimizzato
  ProjectionDomain.recalculateAll();

  FinOpsDatabase.commit();

  console.log("=== BATCH: ALLINEAMENTO INIZIATIVE COMPLETATO ===");
}

/**
 * MACRO MANUALE 4: ALLINEAMENTO STRUTTURALE GLOBALE (Full Maintenance System)
 * Esegue il ricalcolo completo di tutta la galassia FinOps rispettando le dipendenze logiche.
 * Da lanciare in caso di modifiche massive manuali o disallineamenti gravi del DB.
 */
function batchRunFullSystemAlignment() {
  console.log("=== 🚀 AVVIO ALLINEAMENTO STRUTTURALE GLOBALE ===");

  console.log("[1/4] Calcolo metriche finanziarie su Contratti e Master...");
  ContractDomain.forceRecalculateAll();

  console.log("[2/4] Elaborazione del Cascading Baseline sulle Iniziative...");
  InitiativeDomain.forceRecalculateAll();

  console.log("[4/4] Consolidamento Budget Status sul portafoglio degli Asset...");
  AssetDomain.consolidateBudgets();

  FinOpsDatabase.commit();

  console.log("=== 🟢 ARCHITETTURA COMPLETAMENTE ALLINEATA IN MODO COERENTE ===");
}