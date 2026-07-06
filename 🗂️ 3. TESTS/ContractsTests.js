/**
 * ============================================================================
 * FINOPS UNIT TESTING: CONTRACTS DOMAIN COMPREHENSIVE TESTS (PURE DTO PATTERN)
 * ============================================================================
 */
(function () {
  const registry = GLOBAL_TEST_REGISTRY.contracts;

  registry.push({
    description: "Contract.getDurationMonths() - Gestione anno bisestile",
    fn: function (assert) {
      const contract = new Contract({ startDate: "2028-01-01", contractEndDate: "2028-12-31" });
      assert.equal(contract.getDurationMonths(), 12);
    }
  });

  registry.push({
    description: "Contract.getAnnualValue() - Contratti One-Shot vs Recurrent",
    fn: function (assert) {
      const recurrent = new Contract({ startDate: "2026-01-01", contractEndDate: "2026-06-30", costRecurrence: "Recurrent", totalCommitment: 50000 });
      assert.closeTo(recurrent.getAnnualValue(), 100000, 100);

      const oneShot = new Contract({ startDate: "2026-01-01", contractEndDate: "2026-06-30", costRecurrence: "One-Shot", totalCommitment: 50000 });
      assert.equal(oneShot.getAnnualValue(), 50000);
    }
  });

  registry.push({
    description: "MasterContract.getRunRate() - Aggregazione selettiva solo su contratti Recurrent",
    fn: function (assert) {
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
    fn: function (assert) {
      const service = new ContractService();
      const generatedId = service.generateId("CTR", "GOOGLE", "CLOUD SUITE", "2026", 5);
      assert.equal(generatedId, "CTR-GGL-CLDS-2026-05");
    }
  });

  registry.push({
    description: "ContractService.generateId() [Master] - Non deve contenere virgole se il Fornitore ha punteggiatura",
    fn: function (assert) {
      const service = new ContractService();
      const generatedMasterId = service.generateId("MCT", "Oracle, Corp. Ltd.", "Database", "2026", 1);
      assert.equal(generatedMasterId.includes(","), false);
    }
  });

  registry.push({
    description: "ContractService.generateId() [Contract] - Non deve contenere virgole se l'Asset Name contiene virgole",
    fn: function (assert) {
      const service = new ContractService();
      const generatedContractId = service.generateId("CTR", "Microsoft", "SaaS, Premium License", "2026", 12);
      assert.equal(generatedContractId.includes(","), false);
    }
  });

  registry.push({
    description: "Verification: MASTER_FIELD_MAP deve allinearsi alle colonne reali del foglio MasterContracts",
    fn: function (assert) {
      assert.equal(MASTER_FIELD_MAP["Run Rate"] !== undefined, true);
      assert.equal(MASTER_FIELD_MAP["Asset Name"] !== undefined, true);
    }
  });

  registry.push({
    description: "TDD: MasterContract.exportToData() - Deve preservare il campo 'Previous Master ID' e mapparlo in camelCase per la Timeline",
    fn: function (assert) {
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
    fn: function (assert) {
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
    fn: function (assert) {
      const splitFromUI = new AllocationSplit({ allocationRule: "Percentage", percentageShare: 27 });
      const splitFromSheet = new AllocationSplit({ allocationRule: "Percentage", percentageShare: 0.27 });

      assert.equal(splitFromUI.exportToData().percentageShare, 0.27);
      assert.equal(splitFromSheet.exportToData().percentageShare, 0.27);
    }
  });

  registry.push({
    description: "TDD: MasterContract.addChild() - Il contratto figlio DEVE ereditare rigorosamente i campi di lookup dal Master",
    fn: function (assert) {
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
    fn: function (assert) {
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

  // --------------------------------------------------------------------------
  // TDD LEDGER: FINOPS SMART MATRIX & ANTI-DUPLICATION ENGINE
  // --------------------------------------------------------------------------

  registry.push({
    description: "TDD: Contract.exportFullLedger() - Deve rispettare la matrice: Flat Upfront vs Consumo",
    fn: function (assert) {
      const baseDto = { startDate: "2026-01-01", contractEndDate: "2026-12-31", totalCommitment: 12000 };

      const cFlat = new Contract({ ...baseDto, id: "C-FLAT", billingTerms: "Full Upfront / Prepaid", pricingModel: "Flat" });
      cFlat.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      const cMin = new Contract({ ...baseDto, id: "C-MIN", billingTerms: "Pay-As-You-Go", pricingModel: "Minimum Consumption" });
      cMin.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100, startDate: "2026-01-01", endDate: "2026-01-31" }));

      // Flat Upfront non autogenera nulla (preserva solo il movimento manuale)
      assert.equal(cFlat.exportFullLedger().length, 1);
      // Minimum a consumo genera i mesi mancanti a copertura del commitment
      assert.equal(cMin.exportFullLedger().length, 12);
    }
  });

  registry.push({
    description: "TDD: Contract.generateForecastLedger() - 'Fixed Recurring' autogenera il piano fatturazione",
    fn: function (assert) {
      const dto = {
        id: "CTR-FIXED-REC",
        pricingModel: "Flat",
        billingTerms: "Fixed Recurring",
        billingFrequency: "Every 4 Months",
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31",
        totalCommitment: 12000
      };
      const contract = new Contract(dto);
      const ledger = contract.generateForecastLedger(contract.ledger);

      assert.equal(ledger.length, 3);
      assert.equal(ledger[0].amount, 4000);
      assert.equal(ledger[0].type, "CALCULATED");
      assert.equal(new Date(ledger[1].startDate).getMonth(), 4);
    }
  });

  registry.push({
    description: "TDD: Contract.generateForecastLedger() - 'Pay-As-You-Go' ricalcola il residuo per il commitment",
    fn: function (assert) {
      const dto = {
        id: "CTR-PAYG",
        pricingModel: "Capped Consumption",
        billingTerms: "Pay-As-You-Go",
        totalCommitment: 1000,
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31"
      };
      const contract = new Contract(dto);

      contract.ledger.push(new LedgerMovement({
        type: "ACTUAL", amount: 200, startDate: "2026-03-01", endDate: "2026-03-31"
      }));

      const autoLedger = contract.generateForecastLedger(contract.ledger);

      assert.equal(autoLedger.length, 9);
      assert.closeTo(autoLedger[0].amount, 88.89, 0.1);
    }
  });

  registry.push({
    description: "TDD: Contract.calculateYtdRoySplit() - Oracolo del tempo per YTD vs ROY sui contratti Flat",
    fn: function (assert) {
      const dto = {
        billingTerms: "Full Upfront / Prepaid",
        pricingModel: "Flat",
        totalCommitment: 12000,
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31"
      };
      const contract = new Contract(dto);

      const split = contract.calculateYtdRoySplit(new Date("2026-05-01T00:00:00Z"));

      assert.true(split !== undefined, "Il metodo calculateYtdRoySplit deve esistere");
      assert.equal(split.ytdActuals, 4000);
      assert.equal(split.royForecast, 8000);
    }
  });

  registry.push({
    description: "TDD: Contract.exportFullLedger() - Deve ripulire i vecchi CALCULATED e non sovrascrivere gli ACTUAL (Anti-Duplicazione)",
    fn: function (assert) {
      const contract = new Contract({
        id: "CTR-DUP-TEST",
        pricingModel: "Flat",
        billingTerms: "Fixed Recurring",
        billingFrequency: "Monthly",
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31",
        totalCommitment: 12000
      });

      // L'utente ha approvato la fattura di Gennaio (ACTUAL)
      contract.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 1000, startDate: "2026-01-01", endDate: "2026-01-31" }));
      // Ci sono due vecchi autocalcoli spuri nel DB che devono essere spazzati via
      contract.ledger.push(new LedgerMovement({ type: "CALCULATED", amount: 1000, startDate: "2026-02-01", endDate: "2026-02-28" }));
      contract.ledger.push(new LedgerMovement({ type: "CALCULATED", amount: 1000, startDate: "2026-03-01", endDate: "2026-03-31" }));

      const resultLedger = contract.exportFullLedger();

      const actualCount = resultLedger.filter(l => l.type === "ACTUAL").length;
      const calculatedCount = resultLedger.filter(l => l.type === "CALCULATED").length;

      // Ci aspettiamo l'1 ACTUAL mantenuto intatto
      assert.equal(actualCount, 1);
      // Il motore mensile genera i 11 mesi rimanenti saltando Gennaio che ha già l'ACTUAL!
      assert.equal(calculatedCount, 11);
    }
  });

  // --------------------------------------------------------------------------
  // TDD FINANCE: RUN RATE AGGREGATION
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: MasterContract.getRunRate() - Aggregates annual values strictly for Recurrent child contracts",
    fn: function (assert) {
      // 1. ARRANGE
      const master = new MasterContract({ masterId: "MCT-FINANCE-01", supplier: "TechCorp" });

      // Contratto 1: Recurrent, 2 anni, 24.000€ totali -> Valore Annuale: 12.000€
      const recurrentChild = new Contract({
        contractId: "CTR-REC-01",
        costRecurrence: "Recurrent",
        totalCommitment: 24000,
        startDate: "2026-01-01",
        contractEndDate: "2027-12-31"
      });

      // Contratto 2: One-Shot, 6 mesi, 50.000€ totali -> Valore Annuale: 50.000€ (ma NON deve finire nel Run Rate)
      const oneShotChild = new Contract({
        contractId: "CTR-ONE-02",
        costRecurrence: "One-Shot",
        totalCommitment: 50000,
        startDate: "2026-01-01",
        contractEndDate: "2026-06-30"
      });

      // Contratto 2: Recurrent, 6 mesi, 10.000€ totali -> Valore Annuale: 20.000€
      const recurrentChild2 = new Contract({
        contractId: "CTR-ONE-02",
        costRecurrence: "Recurrent",
        totalCommitment: 10000,
        startDate: "2026-01-01",
        contractEndDate: "2026-06-30"
      });

      master.addChild(recurrentChild);
      master.addChild(oneShotChild);
      master.addChild(recurrentChild2);

      // 2. ACT
      const calculatedRunRate = master.getRunRate();

      // 3. ASSERT
      // Il sistema deve restituire 12000+20000, ignorando i 50000 del One-Shot.
      assert.equal(calculatedRunRate, 32000);
    }
  });

})();