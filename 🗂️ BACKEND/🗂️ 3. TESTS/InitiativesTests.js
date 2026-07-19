/**
 * ============================================================================
 * FINOPS UNIT TESTING: INITIATIVES DOMAIN COMPREHENSIVE TESTS
 * ============================================================================
 */
(function () {
  const registry = GLOBAL_TEST_REGISTRY.initiatives;

  registry.push({
    description: "Initiative.injectContext() - Calcolo Baseline, Lookup Top-Down e Ricalcolo Saving",
    fn: function (assert) {
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
    fn: function (assert) {
      const initPlanned = new Initiative({ targetDate: "2026-06-01", actualDate: "" });
      assert.equal(formatServerDate(initPlanned.getEffectiveDate()), "2026-06-01");

      const initCompleted = new Initiative({ targetDate: "2026-06-01", actualDate: "2026-05-15", status: "COMPLETED" });
      assert.equal(formatServerDate(initCompleted.getEffectiveDate()), "2026-05-15");
    }
  });

  registry.push({
    description: "Initiative.exportToData() - Deve preservare il dizionario completo e le colonne esterne",
    fn: function (assert) {
      const mockRowFromSheet = {
        "Initiative ID": "INC-TEST",
        "Asset Name": "Cloud Big Data Cluster",
        "Asset ID": "AST-007", // <-- AGGIUNTA
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
      assert.equal(exportedData.assetId, "AST-007"); // <-- AGGIUNTA
      assert.equal(exportedData.optimizationLevers, "Tier Consolidation");
      assert.equal(exportedData.qualityCheck, "PASSED");

      // Rete di Sicurezza
      assert.equal(exportedData["Colonna Ignota"], "Segreto");
    }
  });

  registry.push({
    description: "TDD Initiatives Dual Scope: injectContext() deve estrarre Baseline, Term, Expiration e Type dal contratto locale se specificato, ignorando il Master",
    fn: function (assert) {
      // 1. ARRANGE: Dati fittizi dal Database
      const masterData = {
        "Supplier": "AWS",
        "Contract Term (Months)": 36,
        "Master End Date": "2030-12-31",
        "Run Rate": 100000
      };

      const contractsData = [
        {
          "Contract ID": "CTR-LOCAL",
          "Master Contract ID": "MCT-01",
          "Contract Term (Months)": 12,
          "Contract End Date": "2026-12-31",
          "Annual Value": 20000,
          "Expenditure Type": "CAPEX"
        },
        {
          "Contract ID": "CTR-OTHER",
          "Master Contract ID": "MCT-01",
          "Contract Term (Months)": 24,
          "Contract End Date": "2028-12-31",
          "Annual Value": 80000,
          "Expenditure Type": "OPEX"
        }
      ];

      // Iniziativa Globale (Nessun Contract ID)
      const globalInit = new Initiative({ id: "INC-GLOBAL", masterId: "MCT-01" });

      // Iniziativa Locale (Target chirurgico su CTR-LOCAL)
      const localInit = new Initiative({ id: "INC-LOCAL", masterId: "MCT-01", contractId: "CTR-LOCAL" });

      // 2. ACT
      globalInit.injectContext(masterData, contractsData);
      localInit.injectContext(masterData, contractsData);

      // 3. ASSERT: Verifichiamo il comportamento DUAL SCOPE
      // Test Iniziativa GLOBALE (deve prendere i dati dal Master)
      assert.equal(globalInit.baselineSpendAnnualized, 100000, "Global: Baseline deve essere 100k (Master)");
      assert.equal(globalInit.contractTermMonths, 36, "Global: Term deve essere 36 (Master)");
      assert.equal(formatServerDate(globalInit.lastExpiration), "2030-12-31", "Global: Expiration deve essere 2030 (Master)");

      // Test Iniziativa LOCALE (deve prendere i dati da CTR-LOCAL)
      assert.equal(localInit.baselineSpendAnnualized, 20000, "Local: Baseline deve essere 20k (Contract)");
      assert.equal(localInit.contractTermMonths, 12, "Local: Term deve essere 12 (Contract)");
      assert.equal(formatServerDate(localInit.lastExpiration), "2026-12-31", "Local: Expiration deve essere 2026 (Contract)");
      assert.equal(localInit.expenditureType, "CAPEX", "Local: Expenditure Type deve essere CAPEX (Contract)");
    }
  });

  registry.push({
    description: "TDD Initiatives Pure Lookup: injectContext() deve valorizzare le colonne nominali Baseline (Annualized) e Contract Term",
    fn: function (assert) {
      // ARRANGE
      const mockMaster = { "Supplier": "AWS", "Contract Term (Months)": "36.0000", "Run Rate": 100000 };
      const mockContracts = [{ "Contract ID": "CTR-LOCAL", "Contract Term (Months)": "22.9849", "Annual Value": 25000 }];

      const localInit = new Initiative({ id: "INC-TEST", masterId: "MCT-01", contractId: "CTR-LOCAL" });

      // ACT
      localInit.injectContext(mockMaster, mockContracts, []);

      // ASSERT
      assert.equal(localInit.baselineAnnualized, 25000, "La lookup nominale Baseline (Annualized) deve riflettere il valore puro del contratto (25k)");
      assert.equal(localInit.contractTerm, 23, "La lookup nominale Contract Term deve essere arrotondata all'intero più vicino (23 invece di 22.9849)");
    }
  });

})();