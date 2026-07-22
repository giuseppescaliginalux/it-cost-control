/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: BATCH COMMANDS & MAINTENANCE MACROS
 * ============================================================================
 * Catalogo centralizzato delle operazioni massive eseguibili da trigger o UI.
 * Ogni macro pulisce automaticamente la cache per garantire dati reattivi.
 * ============================================================================
 */

/**
 * INTERNAL UTILITY: Clears the WebApp boot cache to force data reload.
 */
function clearAppCache() {
  try {
    FinOpsCache.clear("DASHBOARD_PAYLOAD");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      ss.toast(
        "🧹 WebApp cache successfully cleared. The next load will fetch fresh data.",
        "FinOps System",
        5
      );
    }
  } catch (error) {
    console.error("Critical error during cache clearing:", error);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      ss.toast("Error clearing cache. Please check the logs.", "System Error", 5);
    }
  }
}

/**
 * MACRO COMMERCIALE 1: RIGENERAZIONE SCADENZIARI GLOBALE AUTO-FORECAST
 * Pulisce a tappeto tutti i record predittivi CALCULATED e rigenera lo scadenziario
 * allineato alla Billing Frequency (escludendo Full Upfront e Custom), ordinando desc.
 */
function batchRecalculateEcosystemLedgers() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    console.log("=== 🚀 AVVIO MANUTENZIONE MASSIVA: GENERAZIONE JIT LEDGER ===");

    // 1. Precaricamento atomico delle tabelle in RAM
    FinOpsDatabase.preloadAll();

    const contractRepo = new ContractRepository();
    const dtosMasters = ContractDomain.removeDuplicatesByKey(contractRepo.findAllMasters(), "masterId");
    const dtosDetails = ContractDomain.removeDuplicatesByKey(contractRepo.findAllContracts(), "contractId");
    const dtosSplits = contractRepo.findAllSplits();
    const dtosLedger = contractRepo.findAllLedger();
    const dtosInits = contractRepo.findAllInitiativesAsDomain();

    // 2. Isolamento dei dati reali (Vaporizzazione preventiva dei soli CALCULATED)
    const stableLedgerRecords = dtosLedger.filter(l => String(l.type).toUpperCase().trim() !== "CALCULATED");

    const detailsByMaster = ContractDomain.groupBy(dtosDetails, ["masterId"]);
    const splitsByContract = ContractDomain.groupBy(dtosSplits, ["contractId"]);
    const ledgerByContract = ContractDomain.groupBy(stableLedgerRecords, ["contractId"]);
    const initsByMaster = ContractDomain.groupBy(dtosInits, ["masterId"]);

    let finalDetails = [];
    let finalLedger = [];

    // 3. Loop di rispalmatura ad intervalli frequenziali (Matrice PAYG e Fixed Recurring)
    dtosMasters.forEach(dtoMaster => {
      const mId = dtoMaster.masterId;
      const detailsForMaster = detailsByMaster[mId] || [];
      const masterInits = initsByMaster[mId] || [];

      const master = new MasterContract({
        ...dtoMaster,
        billingChannel: dtoMaster.billingChannel || (detailsForMaster.length > 0 ? detailsForMaster[0].billingChannel : "")
      });

      detailsForMaster.forEach(dtoDetail => {
        const contract = new Contract(dtoDetail);

        const linkedLedger = ledgerByContract[contract.id] || [];
        linkedLedger.forEach(dtoL => contract.ledger.push(new LedgerMovement(dtoL)));

        const linkedSplits = splitsByContract[contract.id] || [];
        linkedSplits.forEach(dtoS => contract.splits.push(new AllocationSplit(dtoS)));

        master.addChild(contract);
      });

      // Esportiamo lo scadenziario frequenziale ordinato decrescente
      master.childContracts.forEach(c => {
        finalDetails.push(c.exportToData());
        finalLedger = finalLedger.concat(c.exportFullLedger());
      });
    });

    // 4. Scrittura bulk coordinata sul foglio di calcolo
    contractRepo.overwriteAllContracts(finalDetails);
    contractRepo.overwriteAllLedger(finalLedger);

    // 5. Consolidamento automatico a cascata dello stato degli Asset
    AssetDomain.consolidateBudgets();

    FinOpsDatabase.commit();

    // 6. Invalida la cache per aggiornare la WebApp
    clearAppCache();

    try {
      SpreadsheetApp.getActiveSpreadsheet().toast("⚡ Allineamento frequenziale completato!", "FinOps Engine");
    } catch (e) { }
    console.log("=== 🟢 ALLINEAMENTO LEDGER COMPLETATO CON SUCCESSO ===");
  } catch (error) {
    try {
      SpreadsheetApp.getUi().alert("Batch Failure: " + error.message);
    } catch (e) { console.error(error); }
  } finally {
    lock.releaseLock();
  }
}

/**
 * MACRO MANUALE 2: Ricalcola e riallinea l'intero ecosistema contrattuale (Master e Dettagli).
 * Da lanciare se si toccano a mano i valori economici o le date sui fogli del DB.
 */
function batchRecalculateContractsEcosystem() {
  console.log("=== BATCH: AVVIO RICALCOLO COMPLETO CONTRATTI ===");

  // 1. Ricalcola i totali dei Master basandosi sui figli
  ContractDomain.forceRecalculateAll();

  // 2. Sincronizza a cascata le iniziative (le cui baseline dipendono dai contratti modificati)
  InitiativeDomain.forceRecalculateAll();

  // 3. Consolida lo stato finanziario e le macchine a stati degli Asset
  AssetDomain.consolidateBudgets();

  FinOpsDatabase.commit();
  clearAppCache();

  console.log("=== BATCH: RICALCOLO CONTRATTI COMPLETATO CON SUCCESSO ===");
}

/**
 * MACRO MANUALE 3: Ricalcola e normalizza il foglio delle Iniziative.
 * Da lanciare se modifichi a mano le percentuali di target o sconti direttamente sulle celle.
 */
function batchRecalculateInitiativesOnly() {
  console.log("=== BATCH: AVVIO RICALCOLO SELETTIVO INIZIATIVE ===");

  // 1. Forza la lookup delle iniziative per estrarre le nuove baseline
  InitiativeDomain.forceRecalculateAll();

  // 2. Aggiorna lo stato degli asset agganciati
  AssetDomain.consolidateBudgets();

  FinOpsDatabase.commit();
  clearAppCache();

  console.log("=== BATCH: ALLINEAMENTO INIZIATIVE COMPLETATO ===");
}

/**
 * MACRO MANUALE 4: ALLINEAMENTO STRUTTURALE GLOBALE (Full Maintenance System)
 * Ricalcola da zero l'intero ecosistema rispettando l'ordine logico delle dipendenze.
 */
function batchRunFullSystemAlignment() {
  console.log("=== 🚀 AVVIO ALLINEAMENTO STRUTTURALE GLOBALE ===");

  console.log("[1/3] Calcolo metriche finanziarie su Contratti e Master...");
  ContractDomain.forceRecalculateAll();

  console.log("[2/3] Elaborazione del Cascading Baseline sulle Iniziative...");
  InitiativeDomain.forceRecalculateAll();

  console.log("[3/3] Consolidamento Budget Status e macchine a stati degli Asset Center...");
  AssetDomain.consolidateBudgets();

  FinOpsDatabase.commit();
  clearAppCache();

  console.log("=== 🟢 ARCHITETTURA COMPLETAMENTE ALLINEATA IN MODO COERENTE ===");
}