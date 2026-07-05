/**
 * ============================================================================
 * FINOPS UNIT TESTING: INITIATIVES DOMAIN COMPREHENSIVE TESTS
 * ============================================================================
 */
(function() {
  const registry = GLOBAL_TEST_REGISTRY.initiatives;

  registry.push({
    description: "Initiative.injectContext() - Calcolo Baseline, Lookup Top-Down e Ricalcolo Saving",
    fn: function(assert) {
      const init = new Initiative({ id: "INC-001", targetCostAnnualized: 170000, decision: "OPTIMIZATION" });
      init.injectContext({ runRate: 200000, supplier: "AWS", masterEndDate: "2028-12-31" }, []);

      assert.equal(init.supplier, "AWS");
      assert.equal(formatServerDate(init.lastExpiration), "2028-12-31");
      assert.equal(init.baselineSpendAnnualized, 200000);
      assert.equal(init.targetSavingAnnualized, 30000);
      assert.equal(init.targetSavingPct, 0.15);
    }
  });

  registry.push({
    description: "Initiative.getEffectiveDate() - Fallback logico tra Actual e Target Date",
    fn: function(assert) {
      const initPlanned = new Initiative({ targetDate: "2026-06-01", actualDate: "" });
      assert.equal(formatServerDate(initPlanned.getEffectiveDate()), "2026-06-01");

      const initCompleted = new Initiative({ targetDate: "2026-06-01", actualDate: "2026-05-15", status: "COMPLETED" });
      assert.equal(formatServerDate(initCompleted.getEffectiveDate()), "2026-05-15");
    }
  });

  registry.push({
    description: "Initiative.exportToData() - Deve preservare il dizionario completo e le colonne esterne",
    fn: function(assert) {
      const mockRowFromSheet = {
        "Initiative ID": "INC-TEST",
        "Asset Name": "Cloud Big Data Cluster",
        "Target Cost (Annualized)": 80000,
        "Optimization Levers": "Tier Consolidation",
        "Quality Check": "PASSED",
        "Colonna Ignota": "Segreto"
      };

      // Usiamo il mapper di dominio locale
      const dto = InitiativeMapper.toDto(mockRowFromSheet);
      const initiative = new Initiative(dto);
      initiative.injectContext({ runRate: 100000 }, []);
      const exportedData = initiative.exportToData();

      assert.equal(exportedData.baselineSpendAnnualized, 100000);
      assert.equal(exportedData.targetCostAnnualized, 80000);
      assert.equal(exportedData.targetSavingAnnualized, 20000);

      assert.equal(exportedData.assetName, "Cloud Big Data Cluster");
      assert.equal(exportedData.optimizationLevers, "Tier Consolidation");
      assert.equal(exportedData.qualityCheck, "PASSED");
      
      // Rete di Sicurezza
      assert.equal(exportedData["Colonna Ignota"], "Segreto");
    }
  });
})();