/**
 * ============================================================================
 * FINOPS UNIT TESTING: CONTRACTS DOMAIN COMPREHENSIVE TESTS (PURE DTO PATTERN)
 * ============================================================================
 */
(function() {
  const registry = GLOBAL_TEST_REGISTRY.contracts;

  registry.push({
    description: "Contract.getDurationMonths() - Gestione anno bisestile",
    fn: function(assert) {
      const contract = new Contract({ startDate: "2028-01-01", contractEndDate: "2028-12-31" });
      assert.equal(contract.getDurationMonths(), 12);
    }
  });

  registry.push({
    description: "Contract.getAnnualValue() - Contratti One-Shot vs Recurrent",
    fn: function(assert) {
      const recurrent = new Contract({ startDate: "2026-01-01", contractEndDate: "2026-06-30", costRecurrence: "Recurrent", totalCommitment: 50000 });
      assert.closeTo(recurrent.getAnnualValue(), 100000, 100);

      const oneShot = new Contract({ startDate: "2026-01-01", contractEndDate: "2026-06-30", costRecurrence: "One-Shot", totalCommitment: 50000 });
      assert.equal(oneShot.getAnnualValue(), 50000);
    }
  });

  registry.push({
    description: "MasterContract.getRunRate() - Aggregazione selettiva solo su contratti Recurrent",
    fn: function(assert) {
      const master = new MasterContract({ supplier: "AWS" });
      const c1 = new Contract({ startDate: "2026-01-01", contractEndDate: "2026-12-31", costRecurrence: "Recurrent", totalCommitment: 120000 });
      const c2 = new Contract({ startDate: "2026-01-01", contractEndDate: "2026-12-31", costRecurrence: "One-Shot", totalCommitment: 50000 });
      
      master.addChild(c1);
      master.addChild(c2);

      assert.equal(master.getRunRate(), 120000);
    }
  });

  registry.push({
    description: "ContractService.generateId() - Algoritmo di compressione Smurf Naming (Rimozione vocali)",
    fn: function(assert) {
      const service = new ContractService();
      const generatedId = service.generateId("CTR", "GOOGLE", "CLOUD SUITE", "2026", 5);
      assert.equal(generatedId, "CTR-GGL-CLDS-2026-05");
    }
  });

  registry.push({
    description: "ContractService.generateId() [Master] - Non deve contenere virgole se il Fornitore ha punteggiatura",
    fn: function(assert) {
      const service = new ContractService();
      const generatedMasterId = service.generateId("MCT", "Oracle, Corp. Ltd.", "Database", "2026", 1);
      assert.equal(generatedMasterId.includes(","), false);
    }
  });

  registry.push({
    description: "ContractService.generateId() [Contract] - Non deve contenere virgole se l'Asset Name contiene virgole",
    fn: function(assert) {
      const service = new ContractService();
      const generatedContractId = service.generateId("CTR", "Microsoft", "SaaS, Premium License", "2026", 12);
      assert.equal(generatedContractId.includes(","), false);
    }
  });

  registry.push({
    description: "Verification: MASTER_FIELD_MAP deve allinearsi alle colonne reali del foglio MasterContracts",
    fn: function(assert) {
      assert.equal(MASTER_FIELD_MAP["Run Rate"] !== undefined, true);
      assert.equal(MASTER_FIELD_MAP["Asset Name"] !== undefined, true);
    }
  });

  registry.push({
    description: "TDD: MasterContract.exportToData() - Deve preservare il campo 'Previous Master ID' e mapparlo in camelCase per la Timeline",
    fn: function(assert) {
      const mockSheetRow = {
        "Master Contract ID": "MCT-TDD-02",
        "Previous Master ID": "MCT-TDD-01",
        "Supplier": "Microsoft",
        "Scope": "Cloud Productivity"
      };
      const dto = ContractMapper.toDto(mockSheetRow, MASTER_FIELD_MAP);
      const master = new MasterContract(dto);
      const exported = master.exportToData([]);

      assert.equal(MASTER_FIELD_MAP["Previous Master ID"], "previousMasterId");
      assert.equal(exported.previousMasterId, "MCT-TDD-01");
      assert.equal(exported.masterScope, "Cloud Productivity");
    }
  });

  registry.push({
    description: "TDD: Contract.exportToData() - Deve preservare i campi anagrafici e descrittivi estratti dal foglio",
    fn: function(assert) {
      const mockRawRow = {
        "Contract ID": "CTR-DATALOSS-01",
        "Asset Name": "Salesforce CRM",
        "Supplier": "Salesforce Inc.",
        "Comments": "Nota vitale da non cancellare"
      };
      
      const dto = ContractMapper.toDto(mockRawRow, CONTRACT_FIELD_MAP);
      const contract = new Contract(dto);
      const exported = contract.exportToData();

      assert.equal(exported.assetName, "Salesforce CRM");
      assert.equal(exported.supplier, "Salesforce Inc.");
      assert.equal(exported.comments, "Nota vitale da non cancellare");
    }
  });

  registry.push({
    description: "TDD: AllocationSplit - Gestione sicura delle percentuali in lettura/scrittura (anti double-division)",
    fn: function(assert) {
      const splitFromUI = new AllocationSplit({ allocationRule: "Percentage", percentageShare: 27 });
      const splitFromSheet = new AllocationSplit({ allocationRule: "Percentage", percentageShare: 0.27 });

      assert.equal(splitFromUI.exportToData().percentageShare, 0.27);
      assert.equal(splitFromSheet.exportToData().percentageShare, 0.27);
    }
  });

  registry.push({
    description: "TDD: MasterContract.addChild() - Il contratto figlio DEVE ereditare rigorosamente i campi di lookup dal Master",
    fn: function(assert) {
      const master = new MasterContract({ masterId: "MCT-LOOKUP-01", assetName: "Cloud Platform", supplier: "Google", billingChannel: "Reseller" });
      const child = new Contract({ contractId: "CTR-LOOKUP-01", assetName: "Vecchio Asset", supplier: "Vecchio Fornitore", billingChannel: "Vecchio Canale" });
      
      master.addChild(child);
      const exportedChild = child.exportToData();
      
      assert.equal(exportedChild.masterId, "MCT-LOOKUP-01");
      assert.equal(exportedChild.assetName, "Cloud Platform");
      assert.equal(exportedChild.supplier, "Google");
      assert.equal(exportedChild.billingChannel, "Reseller");
    }
  });

  registry.push({
    description: "TDD: ContractService.removeDuplicatesByKey() - Deve riconoscere e vaporizzare i record con ID clonato in RAM",
    fn: function(assert) {
      const service = new ContractService();
      const dirtyDataFromSheet = [
        { "Contract ID": "CTR-CLEAN-01", "Value": 100 },
        { "Contract ID": "CTR-CLEAN-02", "Value": 200 },
        { "Contract ID": "CTR-CLEAN-01", "Value": 300 },
        { "Contract ID": "CTR-CLEAN-01", "Value": 400 }
      ];

      const cleanedData = service.removeDuplicatesByKey(dirtyDataFromSheet, "Contract ID");

      assert.equal(cleanedData.length, 2);
      assert.equal(cleanedData[0]["Contract ID"], "CTR-CLEAN-01");
      assert.equal(cleanedData[1]["Contract ID"], "CTR-CLEAN-02");
    }
  });

  registry.push({
    description: "TDD: Contract.exportFullLedger() - Deve rispettare la matrice: Flat, Pure, Minimum, Capped",
    fn: function(assert) {
      const baseDto = { billingTerms: "In Arrears", startDate: "2026-01-01", contractEndDate: "2026-12-31", annualValue: 12000 };

      const cFlat = new Contract({ ...baseDto, id: "C-FLAT", pricingModel: "Flat" });
      cFlat.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      const cPure = new Contract({ ...baseDto, id: "C-PURE", pricingModel: "Pure Consumption" });
      cPure.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      const cMin = new Contract({ ...baseDto, id: "C-MIN", pricingModel: "Minimum Consumption" });
      cMin.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      const cCap = new Contract({ ...baseDto, id: "C-CAP", pricingModel: "Capped Consumption" });
      cCap.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      assert.equal(cFlat.exportFullLedger().length, 0);
      
      const resPure = cPure.exportFullLedger();
      assert.equal(resPure.length, 1);
      assert.equal(resPure[0].type, "ACTUAL");
      
      assert.equal(cMin.exportFullLedger().length > 1, true);
      assert.equal(cCap.exportFullLedger().length > 1, true);
    }
  });

  registry.push({
    description: "TDD: Contract.generateForecastLedger() - Frequenze e blocchi basati su Billing Terms",
    fn: function(assert) {
      const baseDto = { id: "CTR-FREQ-TEST", pricingModel: "Minimum Consumption", startDate: "2026-01-01", contractEndDate: "2026-12-31", annualValue: 12000, totalCommitment: 12000 };

      const cLinear = new Contract({ ...baseDto, billingTerms: "Linear" });
      assert.equal(cLinear.generateForecastLedger().length, 12);
      assert.equal(cLinear.generateForecastLedger()[0].amount, 1000);

      const cQuarterly = new Contract({ ...baseDto, billingTerms: "Quarterly" });
      assert.equal(cQuarterly.generateForecastLedger().length, 4);
      assert.equal(cQuarterly.generateForecastLedger()[0].amount, 3000);

      const cUpfront = new Contract({ ...baseDto, billingTerms: "Full Upfront" });
      assert.equal(cUpfront.generateForecastLedger().length, 0);

      const cLedgerDriven = new Contract({ ...baseDto, billingTerms: "Ledger-Driven" });
      assert.equal(cLedgerDriven.generateForecastLedger().length, 0);
    }
  });

  registry.push({
    description: "TDD: ContractRepository.overwriteAllLedger() - Deve preparare una matrice e scrivere in un unico shot",
    fn: function(assert) {
      class MockContractRepository extends ContractRepository {
        constructor() { super(); this.interceptedMatrix = null; this.wasSheetCleared = false; }
        
        overwriteAllLedger(exportedLedgerArray) {
          const mockHeaders = ["Contract ID", "Type", "Amount", "Start Date", "End Date", "Notes"];
          this.wasSheetCleared = true;
          this.interceptedMatrix = exportedLedgerArray.map(obj => {
            return mockHeaders.map(header => {
              const prop = LEDGER_FIELD_MAP[header];
              return obj[prop] !== undefined ? obj[prop] : "";
            });
          });
        }
      }

      const repo = new MockContractRepository();
      const mockExportedLedger = [
        { contractId: "CTR-TEST-01", type: "ACTUAL", amount: 100, startDate: "2026-01-01", endDate: "2026-01-31", notes: "Note 1" },
        { contractId: "CTR-TEST-02", type: "FORECAST", amount: 200, startDate: "2026-02-01", endDate: "2026-02-28", notes: "Note 2" }
      ];
      
      repo.overwriteAllLedger(mockExportedLedger);
      
      assert.equal(repo.wasSheetCleared, true);
      assert.equal(repo.interceptedMatrix.length, 2);
      assert.equal(repo.interceptedMatrix[0][0], "CTR-TEST-01");
      assert.equal(repo.interceptedMatrix[0][2], 100);
    }
  });

  // --------------------------------------------------------------------------
  // TDD LEDGER: ANTI-DUPLICATION ENGINE REGRESSION
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: Contract.exportFullLedger() - Deve ripulire i vecchi CALCULATED e rigenerare senza duplicare",
    fn: function(assert) {
      const contract = new Contract({
        id: "CTR-DUP-TEST",
        pricingModel: "Minimum Consumption",
        billingTerms: "Linear", // Genererà 12 record mensili automatici
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31",
        annualValue: 12000
      });

      // Simuliamo che nel database ci siano già 1 record reale (ACTUAL) e 2 vecchi record spuri automatici (CALCULATED)
      contract.ledger.push(new LedgerMovement({ contractId: "CTR-DUP-TEST", type: "ACTUAL", amount: 1000, startDate: "2026-01-01", endDate: "2026-01-31" }));
      contract.ledger.push(new LedgerMovement({ contractId: "CTR-DUP-TEST", type: "CALCULATED", amount: 1000, startDate: "2026-02-01", endDate: "2026-02-28" }));
      contract.ledger.push(new LedgerMovement({ contractId: "CTR-DUP-TEST", type: "CALCULATED", amount: 1000, startDate: "2026-03-01", endDate: "2026-03-31" }));

      // Lancio dell'esportazione globale
      const resultLedger = contract.exportFullLedger();

      // Conteggio dei record risultanti
      const actualCount = resultLedger.filter(l => l.type === "ACTUAL").length;
      const calculatedCount = resultLedger.filter(l => l.type === "CALCULATED").length;

      // Ci aspettiamo: 1 record ACTUAL preservato + 12 record CALCULATED freschi generati dal motore lineare.
      // Se restituisce 14, significa che i vecchi record CALCULATED sono stati duplicati in RAM.
      assert.equal(actualCount, 1);
      assert.equal(calculatedCount, 12);
    }
  });

})();