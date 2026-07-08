/**
 * ============================================================================
 * FINOPS UNIT TESTING: PROJECTIONS DOMAIN COMPREHENSIVE TESTS
 * ============================================================================
 */
(function() {
  const registry = GLOBAL_TEST_REGISTRY.projections;

  registry.push({
    description: "ContractProjection - Contratto totalmente esterno al perimetro dell'anno fiscale",
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
      const dto = { contractId: "CTR-TDD-ROLLOVER", startDate: "2025-01-01", endDate: "2026-12-31", costRecurrence: "Recurrent", annualValue: 100000 };
      const fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const projection = new ContractProjection(dto, fy28, []);

      assert.equal(projection.calculateBaseline(), 100000);
      assert.equal(projection.calculateOptimized(), 100000);
    }
  });

  registry.push({
    description: "TDD: ContractProjection - Il Rollover virtuale DEVE interrompersi se esiste un Master Successore",
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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
    fn: function(assert) {
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

  // Aggiungi questo test in fondo a 🗂️ 3. TESTS/ProjectionsTests.js
registry.push({
  description: "TDD Projections: L'infrastruttura PROJECTION_FIELD_MAP deve mappare rigorosamente la colonna 'Cost Center'",
  fn: function (assert) {
    // Verifica la presenza della chiave nel dizionario centrale di dominio
    assert.true(PROJECTION_FIELD_MAP["Cost Center"] !== undefined, "La colonna fisica 'Cost Center' deve essere censita.");
    assert.equal(PROJECTION_FIELD_MAP["Cost Center"], "costCenter", "La proprietà di DTO associata deve essere camelCase 'costCenter'.");
  }
});

registry.push({
    description: "TDD Dual Scope: Un'iniziativa con 'contractId' specifico deve scontare solo il target e ignorare i fratelli",
    fn: function (assert) {
      // 1. ARRANGE: Prepariamo l'ambiente (1 Master, 2 Figli)
      const targetPeriod = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      
      const contractA = { contractId: "CTR-TARGET", masterId: "MCT-DUAL", costRecurrence: "Recurrent", annualValue: 100000, startDate: "2025-01-01", contractEndDate: "2028-12-31" };
      const contractB = { contractId: "CTR-IGNORED", masterId: "MCT-DUAL", costRecurrence: "Recurrent", annualValue: 100000, startDate: "2025-01-01", contractEndDate: "2028-12-31" };

      // L'iniziativa di ottimizzazione colpisce ESCLUSIVAMENTE il contractA
      const localInit = new Initiative({
        status: "COMPLETED", 
        decision: "OPTIMIZE", 
        targetDate: "2025-07-01", 
        targetCostAnnualized: 50000, // Taglio del 50%
        masterId: "MCT-DUAL",
        contractId: "CTR-TARGET" // <-- IL NOSTRO NUOVO TARGET LOCALE
      });
      // La baseline passata al contesto è quella locale del singolo contratto (100k)
      localInit.injectContext({ runRate: 100000 }, []);

      // 2. ACT: Eseguiamo il motore di proiezione per entrambi i contratti usando la stessa iniziativa
      
      // Essendo TDD, replichiamo la logica di filtro del motore backend appena aggiornato
      const linkedInitsA = [localInit].filter(i => i.masterId === contractA.masterId && (i.contractId === "" || i.contractId === contractA.contractId));
      const linkedInitsB = [localInit].filter(i => i.masterId === contractB.masterId && (i.contractId === "" || i.contractId === contractB.contractId));

      const projA = new ContractProjection(contractA, targetPeriod, linkedInitsA);
      const projB = new ContractProjection(contractB, targetPeriod, linkedInitsB);

      const optA = projA.calculateOptimized();
      const optB = projB.calculateOptimized();

      // 3. ASSERT: Validiamo la matematica
      assert.equal(projA.calculateBaseline(), 100000, "La baseline del Contratto A deve essere 100k");
      assert.equal(projB.calculateBaseline(), 100000, "La baseline del Contratto B deve essere 100k");
      
      assert.equal(optA, 50000, "Il Contratto Target A deve recepire lo sconto (50k)");
      assert.equal(optB, 100000, "Il Contratto Fratello B DEVE ignorare lo sconto e rimanere a 100k");
    }
  });

  registry.push({
    description: "TDD Projections: CAPEX Full Upfront deve caricare 100% del Commitment nell'anno della Start Date e 0 negli anni successivi (No Spalmatura)",
    fn: function (assert) {
      // Un server fisico pagato cash il 1 Gennaio 2026 (cade nel FY26). Durata 2 anni.
      const dtoCapex = { 
        contractId: "CTR-SERVER-01", 
        expenditureType: "CAPEX", 
        billingTerms: "Full Upfront", 
        costRecurrence: "Recurrent", 
        startDate: "2026-01-01", 
        contractEndDate: "2027-12-31", 
        totalCommitment: 120000, 
        contractTerm: 24 
      };
      
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const fy27 = new TimePeriod("FY27", "2026-07-01", "2027-06-30");

      const projCapexFY26 = new ContractProjection(dtoCapex, fy26, []);
      const projCapexFY27 = new ContractProjection(dtoCapex, fy27, []);

      // L'impatto di cassa è immediato.
      assert.equal(projCapexFY26.calculateBaseline(), 120000, "Nel FY26 il CAPEX Upfront deve scaricare l'intero importo di 120k");
      assert.equal(projCapexFY27.calculateBaseline(), 0, "Nel FY27 il CAPEX Upfront deve essere 0€ perché già pagato interamente nel passato");
    }
  });

  // ============================================================================
  // TDD SERVER-SIDE PAYLOAD ENRICHMENT: ACTUAL VS VIRTUAL REVERSE ENGINEERING
  // ============================================================================
  registry.push({
    description: "TDD: Reverse Engineering - Scomposizione mensile Actual vs Virtual basata sulle Proiezioni aggregate",
    fn: function (assert) {
      // 1. ARRANGE: La riga aggregata esatta come viene letta dal DB Google Sheets
      const rawProjRow = {
        "Contract ID": "CTR-TEST-REVERSE",
        "FY26 Optimized": 120000, // 10.000/mese (9 mesi vivi, 3 mesi morti)
        "FY27 Optimized": 60000,  // 5.000/mese (Tutti morti/rinnovi)
        "FY28 Optimized": 0
      };

      // Troviamo la fine del contratto vero (Es. 31 Marzo 2026)
      const contractEndDate = new Date("2026-03-31T00:00:00Z");

      // 2. ACT: La funzione purissima che metteremo sul Server prima di chiudere il Payload
      function reverseEngineerMonthlySplit(row, cEnd) {
        const v26 = parseFloat(row["FY26 Optimized"]) || 0;
        const v27 = parseFloat(row["FY27 Optimized"]) || 0;
        const v28 = parseFloat(row["FY28 Optimized"]) || 0;

        let actualData = {};
        let virtualData = {};

        let dCursor = new Date(2025, 6, 1); // 01 Luglio 2025 (Inizio FY26)
        
        for (let i = 0; i < 36; i++) {
          let y = dCursor.getFullYear();
          let m = dCursor.getMonth();
          let monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
          
          // La magia del reverse engineering: il mese supera il contratto?
          let isVirtual = cEnd && dCursor > cEnd;

          let annualBudget = 0;
          if (i < 12) annualBudget = v26;
          else if (i < 24) annualBudget = v27;
          else annualBudget = v28;

          // Spalmatura lineare client-friendly
          let monthlyAccrual = annualBudget / 12;

          if (monthlyAccrual > 0) {
            if (isVirtual) virtualData[monthKey] = monthlyAccrual;
            else actualData[monthKey] = monthlyAccrual;
          }

          dCursor.setMonth(m + 1);
        }
        return { actualValues: actualData, virtualValues: virtualData };
      }

      const result = reverseEngineerMonthlySplit(rawProjRow, contractEndDate);

      // 3. ASSERT: Verifiche Finanziarie
      
      // FY26 (Luglio '25 -> Giugno '26)
      assert.equal(result.actualValues["2025-07"], 10000); // Luglio è Actual
      assert.equal(result.actualValues["2026-03"], 10000); // Marzo è Actual
      assert.equal(result.virtualValues["2026-04"], 10000); // Aprile diventa Virtual
      assert.true(result.actualValues["2026-04"] === undefined, "Ad Aprile non deve esserci quota Actual");

      // FY27 (Luglio '26 -> Giugno '27)
      assert.equal(result.virtualValues["2026-07"], 5000); // Scende a 5k ed è tutto Virtual
      assert.true(result.actualValues["2026-07"] === undefined, "A Luglio non deve esserci quota Actual");

      // Quadratura Total Cost: (9 * 10k) = 90k Actual | (3 * 10k) + (12 * 5k) = 90k Virtual
      let sumActual = Object.values(result.actualValues).reduce((a, b) => a + b, 0);
      let sumVirtual = Object.values(result.virtualValues).reduce((a, b) => a + b, 0);
      
      assert.equal(sumActual, 90000);
      assert.equal(sumVirtual, 90000);
    }
  });

  // ============================================================================
  // TDD SERVER-SIDE PAYLOAD ENRICHMENT: ACTUAL VS VIRTUAL REVERSE ENGINEERING
  // ============================================================================
  registry.push({
    description: "TDD: ProjectionDomain.enrichProjectionsWithMonthlySplits() - Deve arricchire il payload con Actual e Virtual",
    fn: function (assert) {
      const mockRawProjections = [{"Contract ID": "CTR-REVERSE-01", "Asset Name": "Cloud ERP"}];

      const mockContracts = [{
        "Contract ID": "CTR-REVERSE-01",
        "Master Contract ID": "MCT-REVERSE-01",
        "Start Date": "2026-01-01",
        "Contract End Date": "2027-03-31", // 15 mesi di vita: Gen '26 - Mar '27
        "Total Commitment": 150000,
        "Annual Value": 120000, 
        "Pricing Model": "Flat",
        "Billing Terms": "Fixed Recurring",
        "Cost Recurrence": "Recurrent"
      }];

      const enrichedPayload = ProjectionDomain.enrichProjectionsWithMonthlySplits(mockRawProjections, mockContracts, [], []);
      const row = enrichedPayload[0];

      assert.true(row.monthlyActual !== undefined, "Il payload arricchito deve esporre l'oggetto 'monthlyActual'");
      assert.true(row.monthlyVirtual !== undefined, "Il payload arricchito deve esporre l'oggetto 'monthlyVirtual'");

      assert.equal(Math.round(row.monthlyActual["2026-07"]), 10000, "Luglio '26 è competenza viva (Actual)"); 
      assert.equal(Math.round(row.monthlyActual["2027-03"]), 10000, "Marzo '27 è competenza viva (Actual)"); 
      
      assert.true(row.monthlyActual["2027-04"] === undefined, "Aprile '27: Il contratto è scaduto, NON deve avere Actual");
      assert.equal(Math.round(row.monthlyVirtual["2027-04"]), 10000, "Aprile '27: Scatta il Rinnovo Virtuale a budget intatto"); 

      // Ora la somma è giusta perché considera tutti i 15 mesi di vita reale (FY26 e FY27 insieme)
      const sumActual = Object.values(row.monthlyActual).reduce((a, b) => a + b, 0);
      assert.equal(Math.round(sumActual), 150000, "15 mesi di vita totali (Gen '26 - Mar '27) a 10k/mese fanno 150.000"); 
    }
  });

  registry.push({
    description: "TDD: Reverse Engineering - Gestione Iniziativa infra-annuale e Scadenza sfalsata",
    fn: function (assert) {
      const mockRawProjections = [{"Contract ID": "CTR-REVERSE-ADV", "Asset Name": "Cloud Platform"}];

      const mockContracts = [{
        "Contract ID": "CTR-REVERSE-ADV",
        "Master Contract ID": "MCT-REVERSE-ADV",
        "Start Date": "2026-01-01",
        "Contract End Date": "2027-03-31", // 15 mesi di vita
        "Total Commitment": 150000,
        "Annual Value": 120000,            
        "Pricing Model": "Flat",
        "Billing Terms": "Fixed Recurring",
        "Cost Recurrence": "Recurrent"
      }];

      const mockInitiativeRaw = {
        "Master Contract ID": "MCT-REVERSE-ADV",
        "Contract ID": "CTR-REVERSE-ADV",
        "Initiative Status": "COMPLETED",
        "Decision": "OPTIMIZE",
        "Target Date": "2027-01-01",
        "Target Cost (Annualized)": 60000 
      };

      const enrichedPayload = ProjectionDomain.enrichProjectionsWithMonthlySplits(mockRawProjections, mockContracts, [mockInitiativeRaw], []);
      const row = enrichedPayload[0];

      assert.equal(Math.round(row.monthlyActual["2026-07"]), 10000, "Lug '26: Prima dell'iniziativa, run-rate pieno (10k Actual)");
      assert.equal(Math.round(row.monthlyActual["2026-12"]), 10000, "Dic '26: Prima dell'iniziativa, run-rate pieno (10k Actual)");

      assert.equal(Math.round(row.monthlyActual["2027-01"]), 5000, "Gen '27: Iniziativa attiva, costo dimezzato a 60k (5k Actual)");
      assert.equal(Math.round(row.monthlyActual["2027-03"]), 5000, "Mar '27: Ultimo mese di contratto (5k Actual)");

      assert.true(row.monthlyActual["2027-04"] === undefined, "Apr '27: Contratto scaduto, NON deve avere Actual");
      assert.equal(Math.round(row.monthlyVirtual["2027-04"]), 5000, "Apr '27: Scatta il rinnovo virtuale, eredita il costo scontato (5k Virtual)");

      // 12 mesi a 10k + 3 mesi a 5k
      const sumActual = Object.values(row.monthlyActual).reduce((a, b) => a + b, 0);
      assert.equal(Math.round(sumActual), 135000, "Totale Actual (12 mesi a 10k + 3 mesi a 5k) = 135.000");
    }
  });

})();