/**
 * ============================================================================
 * FINOPS UNIT TESTING: INITIATIVES DOMAIN COMPREHENSIVE TESTS
 * ============================================================================
 */
(function() {
  const registry = GLOBAL_TEST_REGISTRY.initiatives;

  registry.push({
    description: "Initiative.getOptimizedRunRate() - Calcolo corretto del tasso di consumo post-ottimizzazione",
    fn: function(assert) {
      const init = new Initiative({ "Initiative ID": "INC-001", "Target Saving %": 15 });
      // Iniezione di un Master Contract con Run Rate a 200.000€
      init.injectMasterContext({ runRate: 200000 });

      // Saving atteso = 15% di 200k = 30.000€
      assert.equal(init.getTargetSavingAmount(), 30000);
      // Run Rate Ottimizzato atteso = 200k - 30k = 170.000€
      assert.equal(init.getOptimizedRunRate(), 170000);
    }
  });

  registry.push({
    description: "Initiative.getEffectiveDate() - Fallback logico tra Actual e Target Date",
    fn: function(assert) {
      const initPlanned = new Initiative({ "Target Date": "2026-06-01", "Actual Date": "" });
      // Se l'iniziativa è pianificata, la data di entrata in vigore è la Target Date
      assert.equal(formatServerDate(initPlanned.getEffectiveDate()), "2026-06-01");

      const initCompleted = new Initiative({ "Target Date": "2026-06-01", "Actual Date": "2026-05-15" });
      // Se l'iniziativa è completata anticipatamente, l'impatto finanziario si sposta sulla Actual Date
      assert.equal(formatServerDate(initCompleted.getEffectiveDate()), "2026-05-15");
    }
  });

  // --------------------------------------------------------------------------
  // NUOVO TEST: BULK PRESERVATION & METADATA SAFETY
  // --------------------------------------------------------------------------

  registry.push({
    description: "Initiative.exportToData() - Deve preservare i metadati descrittivi (Asset Name, Tags, Owner) dopo il calcolo bulk",
    fn: function(assert) {
      // Simuliamo una riga completa proveniente dal tuo foglio con tutte le colonne critiche
      const mockRowFromSheet = {
        "Initiative ID": "INC-TEST-CONSERVATIVE",
        "Asset Name": "Cloud Big Data Cluster",
        "Supplier": "Google Cloud",
        "Tags": "FinOps-2026, Q3-Optimization",
        "Service Owner": "Mario Rossi",
        "Procurement Point": "Direct Contract",
        "Initiative Name": "Right-sizing instances",
        "Initiative Status": "IN PROGRESS",
        "Decision": "OPTIMIZE",
        "Target Date": "2026-08-01",
        "Target Saving %": 20,
        "Notes": "Preserve this note",
        "Quality Check": "PASSED"
      };

      // Istanziamo l'oggetto di dominio
      const initiative = new Initiative(mockRowFromSheet);
      
      // Iniettiamo un finto contesto economico del Master Contract (es. Run Rate di 100.000€)
      initiative.injectMasterContext({ runRate: 100000 });

      // Generiamo il DTO di esportazione destinato al foglio
      const exportedData = initiative.exportToData();

      // 1. VERIFICA DEI CALCOLI (20% di 100k = 20k)
      assert.equal(exportedData["Target Saving Amount"], 20000);
      assert.equal(exportedData["Optimized Run Rate"], 80000);

      // 2. VERIFICA DELLA RETE DI SICUREZZA (Le colonne descrittive NON devono essere sparite)
      assert.equal(exportedData["Asset Name"], "Cloud Big Data Cluster");
      assert.equal(exportedData["Supplier"], "Google Cloud");
      assert.equal(exportedData["Tags"], "FinOps-2026, Q3-Optimization");
      assert.equal(exportedData["Service Owner"], "Mario Rossi");
      assert.equal(exportedData["Procurement Point"], "Direct Contract");
      assert.equal(exportedData["Quality Check"], "PASSED");

      console.log("      [Check Integrity]: Colonne descrittive preservate intatte in RAM.");
    }
  });

})();