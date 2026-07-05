/**
 * ============================================================================
 * FINOPS UNIT TESTING: ASSETS DOMAIN COMPREHENSIVE TESTS (PURE DTO)
 * ============================================================================
 */
(function() {
  const registry = GLOBAL_TEST_REGISTRY.assets;

  // --------------------------------------------------------------------------
  // TEST 1: REGOLE DI VARIANZA BUDGET (Dal Variance Report Reale)
  // --------------------------------------------------------------------------
  registry.push({
    description: "Asset.injectContext() - Calcolo Status Budget tramite Variance Report",
    fn: function(assert) {
      const asset = new Asset({ name: "Cloud Server" });
      
      // La nuova injectContext richiede 4 parametri: (Proiezioni, Contratti, Iniziative, Varianze)
      
      // Caso A: Not Budgeted
      asset.injectContext([], [], [], [
        { "Fiscal Year": "FY27", "Effective Budget": 0, "Variance": -100 }
      ]);
      assert.equal(asset.budgetStatusFY27, "Not Budgeted");

      // Caso B: At Risk (Varianza negativa)
      asset.injectContext([], [], [], [
        { "Fiscal Year": "FY27", "Effective Budget": 50000, "Variance": -5000 }
      ]);
      assert.equal(asset.budgetStatusFY27, "At Risk");

      // Caso C: Secured (Varianza Positiva o Zero)
      asset.injectContext([], [], [], [
        { "Fiscal Year": "FY27", "Effective Budget": 50000, "Variance": 2000 }
      ]);
      assert.equal(asset.budgetStatusFY27, "Secured");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 2: LOOKUP CONTRATTI E INIZIATIVE (Last End Date & Cost Improvement)
  // --------------------------------------------------------------------------
  registry.push({
    description: "Asset.injectContext() - Deve ereditare Last End Date e sommare i Cost Improvement",
    fn: function(assert) {
      const asset = new Asset({ name: "Core Server" });
      
      const mockContracts = [
        { contractEndDate: "2025-12-31" },
        { adjustedEndDate: "2027-06-30" }, // Scadenza massima
        { contractEndDate: "2026-01-01" }
      ];

      const mockInitiatives = [
        { status: "COMPLETED", actualSavingAnnualized: 15000 },
        { status: "IN PROGRESS", targetSavingAnnualized: 5000 },
        { status: "IDEA", targetSavingAnnualized: 100000 } // Ignorata perché in pipeline
      ];

      asset.injectContext([], mockContracts, mockInitiatives, []);

      assert.equal(asset.lastEndDate, "2027-06-30");
      assert.equal(asset.costImprovement, 20000); // 15k + 5k
    }
  });

  // --------------------------------------------------------------------------
  // TEST 3: MACCHINA A STATI FINITI (Current Status Lifecycle)
  // --------------------------------------------------------------------------
  registry.push({
    description: "Asset.injectContext() - Test transizioni Macchina a Stati (EXPIRED, OPTIMIZING, EXITING, DISMISSED)",
    fn: function(assert) {
      const today = new Date();
      const pastDate = new Date(today); pastDate.setFullYear(today.getFullYear() - 1);
      const futureDate = new Date(today); futureDate.setFullYear(today.getFullYear() + 1);

      const pastStr = formatServerDate(pastDate);
      const futureStr = formatServerDate(futureDate);

      // CASO 1: EXPIRED (Scadenza nel passato, zero iniziative)
      const asset1 = new Asset({ name: "A1" });
      asset1.injectContext([], [{ contractEndDate: pastStr }], [], []);
      assert.equal(asset1.currentStatus, "EXPIRED");

      // CASO 2: OPTIMIZING (Iniziativa in corso di ottimizzazione)
      const asset2 = new Asset({ name: "A2" });
      asset2.injectContext([], [{ contractEndDate: futureStr }], [{ status: "IN PROGRESS", decision: "OPTIMIZE" }], []);
      assert.equal(asset2.currentStatus, "OPTIMIZING");

      // CASO 3: EXITING (Dismissione pianificata nel futuro)
      const asset3 = new Asset({ name: "A3" });
      asset3.injectContext([], [{ contractEndDate: futureStr }], [{ status: "IN PROGRESS", decision: "TERMINATE", targetDate: futureStr }], []);
      assert.equal(asset3.currentStatus, "EXITING");
      assert.equal(asset3.targetStatus, "EXIT");

      // CASO 4: DISMISSED (Dismissione completata nel passato)
      const asset4 = new Asset({ name: "A4" });
      asset4.injectContext([], [{ contractEndDate: pastStr }], [{ status: "COMPLETED", decision: "TERMINATE", actualDate: pastStr }], []);
      assert.equal(asset4.currentStatus, "DISMISSED");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: DATA PRESERVATION (Rete di sicurezza per metadati extra)
  // --------------------------------------------------------------------------
  registry.push({
    description: "Asset.exportToData() - Deve preservare le colonne non conosciute dal DTO",
    fn: function(assert) {
      const mockRawRow = {
        "Asset ID": "AST-001",
        "Asset Name": "Cloud CRM",
        "Colonna Segreta HR": "Test HR",
        "Note Contabili": "Non cancellarmi"
      };

      const dto = AssetMapper.toDto(mockRawRow);

      const asset = new Asset(dto);
      const exported = asset.exportToData();

      // FIX: Le colonne conosciute dal sistema ora escono come DTO pulito in camelCase!
      assert.equal(exported.id, "AST-001");
      assert.equal(exported.name, "Cloud CRM");
      
      // Le colonne sconosciute (extraProperties) mantengono invece il nome originale con gli spazi
      assert.equal(exported["Colonna Segreta HR"], "Test HR");
      assert.equal(exported["Note Contabili"], "Non cancellarmi");
    }
  });

})();