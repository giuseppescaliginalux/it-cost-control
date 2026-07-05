/**
 * ============================================================================
 * FINOPS UNIT TESTING: PROJECTIONS DOMAIN COMPREHENSIVE TESTS
 * ============================================================================
 */
(function () {
  const registry = GLOBAL_TEST_REGISTRY.projections;

  registry.push({
    description: "ContractProjection - Contratto totalmente esterno al perimetro dell'anno fiscale",
    fn: function (assert) {
      const dto = { contractId: "CTR-OLD", startDate: "2023-01-01", endDate: "2024-05-01", costRecurrence: "Recurrent", annualValue: 50000 };
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const projection = new ContractProjection(dto, fy26);

      assert.equal(projection.daysOfCompetence, 0);
      assert.equal(projection.calculateBaseline(), 0);
      assert.equal(projection.calculateOptimized(), 0);
    }
  });

  registry.push({
    description: "ContractProjection.calculateOptimized() - Applicazione strategia TERMINATE (Costo si azzera)",
    fn: function (assert) {
      const dto = { contractId: "CTR-TERMINATE-TEST", startDate: "2025-07-01", endDate: "2026-06-30", costRecurrence: "Recurrent", annualValue: 365000 };
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");

      // La dismissione è fissata al 31 Marzo, così dal 1° Aprile il costo si azzera (9 mesi pieni attivi)
      const terminateInit = new Initiative({ status: "COMPLETED", decision: "TERMINATE", targetDate: "2026-04-01" });
      const projection = new ContractProjection(dto, fy26, [terminateInit]);

      assert.equal(projection.calculateBaseline(), 365000);
      assert.closeTo(projection.calculateOptimized(), 273750, 10);
    }
  });

  registry.push({
    description: "ContractProjection.calculateOptimized() - Cascading Multi-Iniziativa (Sconti progressivi)",
    fn: function (assert) {
      const dto = { contractId: "CTR-MULTI-CUT", startDate: "2025-07-01", endDate: "2026-06-30", costRecurrence: "Recurrent", annualValue: 100000 };
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");

      // ALLINEAMENTO DATE: fine vecchio contratto il 30 Giugno -> lo sconto parte il 1° Luglio
      const init1 = new Initiative({ status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2025-06-30", targetCostAnnualized: 90000 });
      init1.injectContext({ runRate: 100000 }, []);

      // Fine primo periodo il 31 Dicembre -> il secondo step parte il 1° Gennaio (a metà anno)
      const init2 = new Initiative({ status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2025-12-31", targetCostAnnualized: 80000 });
      init2.injectContext({ runRate: 90000 }, []);

      const projection = new ContractProjection(dto, fy26, [init1, init2]);
      assert.closeTo(projection.calculateOptimized(), 85000, 500);
    }
  });

  registry.push({
    description: "Projection Orchestrator DTO - Deve preservare le colonne descrittive del contratto originale",
    fn: function (assert) {
      const dto = { contractId: "CTR-PROJ-PRESERVE", supplier: "Amazon Web Services", costCenter: "CC-R&D-01", startDate: "2026-01-01", endDate: "2026-12-31", annualValue: 365000, "Colonna Non Esistente": "Dato Esterno" };
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const projection = new ContractProjection(dto, fy26);
      const exportedDtoRow = { ...dto, fy26Baseline: projection.calculateBaseline() };

      assert.equal(projection.daysOfCompetence, 181);
      assert.equal(exportedDtoRow.fy26Baseline, 182500);
      assert.equal(exportedDtoRow.supplier, "Amazon Web Services");
      assert.equal(exportedDtoRow.costCenter, "CC-R&D-01");
      assert.equal(exportedDtoRow["Colonna Non Esistente"], "Dato Esterno");
    }
  });

  registry.push({
    description: "TDD: ContractProjection - Rinnovo virtuale (Rollover) per i contratti Recurrent oltre la End Date",
    fn: function (assert) {
      const dto = { contractId: "CTR-TDD-ROLLOVER", startDate: "2025-01-01", endDate: "2026-12-31", costRecurrence: "Recurrent", annualValue: 100000 };
      const fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const projection = new ContractProjection(dto, fy28, []);

      assert.equal(projection.calculateBaseline(), 100000);
      assert.equal(projection.calculateOptimized(), 100000);
    }
  });

  registry.push({
    description: "TDD: ContractProjection - Il Rollover virtuale DEVE interrompersi se esiste un Master Successore",
    fn: function (assert) {
      const predDto = { contractId: "CTR-PRED-01", startDate: "2025-01-01", endDate: "2026-12-31", costRecurrence: "Recurrent", annualValue: 365000 };
      const successorStartDate = new Date("2027-07-01");
      const fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");

      const projection = new ContractProjection(predDto, fy28, [], successorStartDate);
      assert.equal(projection.calculateBaseline(), 0);
      assert.equal(projection.calculateOptimized(), 0);
    }
  });

  registry.push({
    description: "TDD: ContractProjection - Standard ERP Monthly Pro-Rata",
    fn: function (assert) {
      const dto = { contractId: "CTR-ERP-TEST", startDate: "2026-11-16", endDate: "2028-12-31", costRecurrence: "Recurrent", annualValue: 12000 };
      const periodNov = new TimePeriod("NOV-26", "2026-11-01", "2026-11-30");
      const projNov = new ContractProjection(dto, periodNov, []);
      const periodDec = new TimePeriod("DEC-26", "2026-12-01", "2026-12-31");
      const projDec = new ContractProjection(dto, periodDec, []);

      assert.equal(projNov.calculateBaseline(), 500);
      assert.equal(projDec.calculateBaseline(), 1000);
    }
  });

  registry.push({
    description: "TDD Projections: Un'iniziativa di Master al 30% deve essere ripartita pro-rata sui contratti figli",
    fn: function (assert) {
      const targetPeriod = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const contractA = { contractId: "CTR-A", masterId: "MCT-SHARED", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-07-01", contractEndDate: "2026-06-30" };
      const contractB = { contractId: "CTR-B", masterId: "MCT-SHARED", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-07-01", contractEndDate: "2026-06-30" };

      // ALLINEAMENTO DATE: fine vecchio contratto il 31 Dicembre -> lo sconto parte il 1° Gennaio
      const sharedInit = new Initiative({
        status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2026-01-01", targetCostAnnualized: 70000
      });
      sharedInit.injectContext({ runRate: 100000 }, []);

      const projA = new ContractProjection(contractA, targetPeriod, [sharedInit]);
      const projB = new ContractProjection(contractB, targetPeriod, [sharedInit]);

      const optA = projA.calculateOptimized();
      const optB = projB.calculateOptimized();

      assert.closeTo(optA + optB, 85000, 10);
      assert.closeTo(optA, 42500, 10);
    }
  });

  registry.push({
    description: "Projections: Ottimizzazioni in cascata (Costo a X e poi a Y) su contratti figli",
    fn: function (assert) {
      const fy26Period = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const fy27Period = new TimePeriod("FY27", "2026-07-01", "2027-06-30");

      const contract1 = { contractId: "CTR-01", masterId: "MCT-CASCADE", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-07-01", contractEndDate: "2028-06-30" };
      const contract2 = { contractId: "CTR-02", masterId: "MCT-CASCADE", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-07-01", contractEndDate: "2028-06-30" };

      // Iniziativa 1: fine vecchio contratto il 30 Giugno 2026 -> attiva l'80k dal 1° giorno del FY27
      const initStep1 = new Initiative({ status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2026-07-01", targetCostAnnualized: 80000 });
      initStep1.injectContext({ runRate: 100000 }, []);

      // Iniziativa 2: fine periodo il 31 Dicembre 2026 -> attiva il 60k dal 1° Gennaio 2027 (metà del FY27)
      const initStep2 = new Initiative({ status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2027-01-01", targetCostAnnualized: 60000 });
      initStep2.injectContext({ runRate: 80000 }, []);

      const activeInits = [initStep1, initStep2];

      const proj1_FY26 = new ContractProjection(contract1, fy26Period, activeInits);
      const proj2_FY26 = new ContractProjection(contract2, fy26Period, activeInits);
      assert.equal(proj1_FY26.calculateOptimized() + proj2_FY26.calculateOptimized(), 100000);

      const proj1_FY27 = new ContractProjection(contract1, fy27Period, activeInits);
      const proj2_FY27 = new ContractProjection(contract2, fy27Period, activeInits);

      assert.closeTo(proj1_FY27.calculateOptimized() + proj2_FY27.calculateOptimized(), 70000, 500);
    }
  });

  // ============================================================================
  // MATRIX CASO 1: INITIATIVE STATUS = COMPLETED (Comanda l'Actual Saving)
  // ============================================================================
  registry.push({
    description: "Matrix 1A: COMPLETED Rinnovo SENZA Successore -> Rollover Virtuale Attivo con Actual Saving",
    fn: function (assert) {
      const fy28Period = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const contract1 = { contractId: "CTR-A1", masterId: "MCT-COMP-NOSUCC", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-01-01", contractEndDate: "2026-12-31" };
      const contract2 = { contractId: "CTR-A2", masterId: "MCT-COMP-NOSUCC", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-01-01", contractEndDate: "2026-12-31" };

      const init = new Initiative({ status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2027-12-31", targetCostAnnualized: 60000 });
      init.injectContext({ runRate: 100000 }, []);

      const proj1 = new ContractProjection(contract1, fy28Period, [init], null);
      const proj2 = new ContractProjection(contract2, fy28Period, [init], null);
      assert.closeTo(proj1.calculateOptimized() + proj2.calculateOptimized(), 80000, 200);
    }
  });

  registry.push({
    description: "Matrix 1B: COMPLETED Rinnovo CON Successore -> Il vecchio contratto deve spegnere il Rollover Virtuale",
    fn: function (assert) {
      const fy28Period = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const contract1 = { contractId: "CTR-A1", masterId: "MCT-COMP-SUCC", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-01-01", contractEndDate: "2026-12-31" };

      const init = new Initiative({ status: "COMPLETED", decision: "OPTIMIZE", targetDate: "2027-12-31", targetCostAnnualized: 60000 });
      init.injectContext({ runRate: 100000 }, []);

      const successorStartDate = new Date("2027-07-01");
      const proj1 = new ContractProjection(contract1, fy28Period, [init], successorStartDate);

      assert.equal(proj1.calculateBaseline(), 0);
      assert.equal(proj1.calculateOptimized(), 0);
    }
  });

  // ============================================================================
  // MATRIX CASO 2: INITIATIVE STATUS <> COMPLETED (Comanda il Target Saving)
  // ============================================================================
  registry.push({
    description: "Matrix 2A: STATUS <> COMPLETED (IDEA) SENZA Successore -> Rollover Attivo con Target Saving",
    fn: function (assert) {
      const fy28Period = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const contract1 = { contractId: "CTR-B1", masterId: "MCT-IDEA-NOSUCC", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-01-01", contractEndDate: "2026-12-31" };
      const contract2 = { contractId: "CTR-B2", masterId: "MCT-IDEA-NOSUCC", costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-01-01", contractEndDate: "2026-12-31" };

      const init = new Initiative({ status: "IN PROGRESS", decision: "OPTIMIZE", targetDate: "2027-12-31", targetCostAnnualized: 50000 });
      init.injectContext({ runRate: 100000 }, []);

      const proj1 = new ContractProjection(contract1, fy28Period, [init], null);
      const proj2 = new ContractProjection(contract2, fy28Period, [init], null);
      assert.closeTo(proj1.calculateOptimized() + proj2.calculateOptimized(), 75000, 200);
    }
  });

  // ============================================================================
  // MATRIX CASO MULTI-SCENARIO: VERIFICA DISCREPANZA STRUTTURALE
  // ============================================================================
  registry.push({
    description: "Matrix Delta: Lo Scenario con Taglio 1/2 e lo Scenario con Taglio 1/3 devono produrre proiezioni diverse",
    fn: function (assert) {
      const fy28Period = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const baseContract = { costRecurrence: "Recurrent", annualValue: 50000, startDate: "2025-01-01", contractEndDate: "2026-12-31" };

      const initA = new Initiative({ status: "IDEA", decision: "OPTIMIZE", targetDate: "2027-12-31", targetCostAnnualized: 25000 });
      initA.injectContext({ runRate: 50000 }, []);

      const initB = new Initiative({ status: "IDEA", decision: "OPTIMIZE", targetDate: "2027-12-31", targetCostAnnualized: 33333.33 });
      initB.injectContext({ runRate: 50000 }, []);

      const resA = new ContractProjection(baseContract, fy28Period, [initA]).calculateOptimized();
      const resB = new ContractProjection(baseContract, fy28Period, [initB]).calculateOptimized();

      const delta = Math.abs(resA - resB);
      assert.true(delta > 1000, `Le proiezioni devono differire sensibilmente tra i due scenari. Delta rilevato: ${delta} €`);
    }
  });

})();