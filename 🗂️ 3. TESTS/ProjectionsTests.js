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
      const oldContract = {
        "Contract ID": "CTR-OLD",
        "Start Date": "2023-01-01",
        "End Date": "2024-05-01",
        "Cost Recurrence": "Recurrent",
        "Annual Value": 50000
      };
      // Finestra FY26: dal 1° Luglio 2025 al 30 Giugno 2026
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const projection = new ContractProjection(oldContract, fy26);

      // I giorni di competenza devono essere tassativamente zero
      assert.equal(projection.daysOfCompetence, 0);
      assert.equal(projection.calculateBaseline(), 0);
      assert.equal(projection.calculateOptimized(), 0);
    }
  });

  registry.push({
    description: "ContractProjection.calculateOptimized() - Applicazione strategia TERMINATE (Costo si azzera)",
    fn: function(assert) {
      const contractDto = {
        "Contract ID": "CTR-TERMINATE-TEST",
        "Start Date": "2025-07-01",
        "End Date": "2026-06-30",
        "Cost Recurrence": "Recurrent",
        "Annual Value": 365000 // 1.000€ esatti al giorno
      };
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");

      // Iniziativa radicale: Dismissione totale del servizio dal 1° Aprile 2026
      // Dal 1° Luglio al 31 Marzo = 274 giorni a prezzo pieno (274.000€). Dal 1° Aprile in poi = 0€.
      const terminateInit = new Initiative({
        initiativeStatus: "COMPLETED",
        decision: "TERMINATE",
        actualDate: "2026-04-01"
      });

      const projection = new ContractProjection(contractDto, fy26, [terminateInit]);
      
      assert.equal(projection.calculateBaseline(), 365000);
      assert.closeTo(projection.calculateOptimized(), 273782.71, 10);
    }
  });

  registry.push({
    description: "ContractProjection.calculateOptimized() - Cascading Multi-Iniziativa (Sconti progressivi)",
    fn: function(assert) {
      const contractDto = {
        "Contract ID": "CTR-MULTI-CUT",
        "Start Date": "2025-07-01",
        "End Date": "2026-06-30",
        "Cost Recurrence": "Recurrent",
        "Annual Value": 100000
      };
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");

      // Iniziativa 1: Sconto del 10% da subito (1° Luglio 2025)
      const init1 = new Initiative({ initiativeStatus: "COMPLETED", decision: "OPTIMIZE", targetDate: "2025-07-01", targetSavingPct: 10 });
      // Iniziativa 2: Un ulteriore 20% di sconto cumulativo a metà anno (1° Gennaio 2026) -> Sconto totale dal 1° gennaio = 30%
      const init2 = new Initiative({ initiativeStatus: "COMPLETED", decision: "OPTIMIZE", targetDate: "2026-01-01", targetSavingPct: 20 });

      const projection = new ContractProjection(contractDto, fy26, [init1, init2]);

      // Spiegazione matematica:
      // Primi 6 mesi (metà anno) scontati del 10% = 50.000 * 0.9 = 45.000€
      // Secondi 6 mesi (metà anno) scontati del 30% = 50.000 * 0.7 = 35.000€
      // Totale atteso ottimizzato = 45.000 + 35.000 = 80.000€
      assert.closeTo(projection.calculateOptimized(), 80000, 500);
    }
  });

  // --------------------------------------------------------------------------
  // NUOVO TEST: METADATA PRESERVATION PER PROIEZIONI FISCALI
  // --------------------------------------------------------------------------

  registry.push({
    description: "ContractProjection.exportToData() - Deve preservare le colonne descrittive del contratto originale",
    fn: function(assert) {
      const mockContractRow = {
        "Contract ID": "CTR-PROJ-PRESERVE",
        "Supplier": "Amazon Web Services",
        "IT Segment": "Infrastructure",
        "Cost Center": "CC-R&D-01",
        "Owner": "Team DevOps",
        "Start Date": "2026-01-01",
        "End Date": "2026-12-31",
        "Annual Value": 365000
      };
      
      const fy26 = new TimePeriod("FY26", "2025-07-01", "2026-06-30");
      const projection = new ContractProjection(mockContractRow, fy26);
      const exported = projection.exportToData();

      // 1. Controlliamo che la matematica giri (181 giorni da gennaio a giugno nel FY26)
      assert.equal(exported["Days of Competence"], 181);
      assert.equal(exported["Baseline Spend"], 182500);

      // 2. SCUOLO DI SICUREZZA: I campi descrittivi originari non devono essere stati cancellati!
      assert.equal(exported["Supplier"], "Amazon Web Services");
      assert.equal(exported["IT Segment"], "Infrastructure");
      assert.equal(exported["Cost Center"], "CC-R&D-01");
      assert.equal(exported["Owner"], "Team DevOps");

      console.log("      [Check Projections Integrity]: Colonne anagrafiche del contratto salvate nel Bulk.");
    }
  });

  // --------------------------------------------------------------------------
  // TDD: ROLLOVER PLURIENNALE SUI CONTRATTI RICORRENTI (BUG DEL 2028)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: ContractProjection - Rinnovo virtuale (Rollover) per i contratti Recurrent oltre la End Date",
    fn: function(assert) {
      const mockContract = {
        "Contract ID": "CTR-TDD-ROLLOVER",
        "Start Date": "2025-01-01",
        "End Date": "2026-12-31", // Scade fisicamente alla fine del 2026
        "Cost Recurrence": "Recurrent",
        "Annual Value": 100000 // 100.000€ all'anno
      };

      // Testiamo il FY28: 01 Luglio 2027 - 30 Giugno 2028.
      // Questa finestra è interamente "nel futuro" rispetto alla End Date fisica del contratto.
      const fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      const projection = new ContractProjection(mockContract, fy28, []);

      // Essendo Recurrent, ci aspettiamo che il motore simuli il rinnovo e proietti gli interi 100.000€ nel FY28
      assert.equal(projection.calculateBaseline(), 100000);
      assert.equal(projection.calculateOptimized(), 100000);
    }
  });

  // --------------------------------------------------------------------------
  // TDD: ANTI DOUBLE-COUNTING (SCADENZE SOVRAPPOSTE E SUCCESSIONI)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: ContractProjection - Il Rollover virtuale DEVE interrompersi se esiste un Master Successore",
    fn: function(assert) {
      const mockPredecessor = {
        "Contract ID": "CTR-PRED-01",
        "Start Date": "2025-01-01",
        "End Date": "2026-12-31", // Scadenza a metà del FY27
        "Cost Recurrence": "Recurrent",
        "Annual Value": 365000 // 1.000€ al giorno
      };
      
      // La Timeline ci dice che questo servizio verrà rimpiazzato dal nuovo contratto 
      // a partire dal 1° Luglio 2027 (Esattamente all'inizio del FY28)
      const successorStartDate = new Date("2027-07-01");
      
      const fy28 = new TimePeriod("FY28", "2027-07-01", "2028-06-30");
      
      // Inizializziamo il predecessore passando al motore la consapevolezza del successore
      const projection = new ContractProjection(mockPredecessor, fy28, [], successorStartDate);

      // Poiché il FY28 è totalmente coperto dal SUCCESSORE, il PREDECESSORE deve generare zero costi.
      // Se il test restituisce 366.000, significa che stiamo subendo un gravissimo doppio conteggio.
      assert.equal(projection.calculateBaseline(), 0);
      assert.equal(projection.calculateOptimized(), 0);
      
      console.log("      [Check Succession]: Il predecessore è stato correttamente spento dal successore.");
    }
  });

  // --------------------------------------------------------------------------
  // TDD: ERP MONTHLY PRO-RATA (Standard SAP / Business Central)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: ContractProjection - Standard ERP Monthly Pro-Rata (Rate flat e spezzature ai bordi)",
    fn: function(assert) {
      const mockContract = {
        "Contract ID": "CTR-ERP-TEST",
        "Start Date": "2026-11-16", // Inizia a metà Novembre
        "End Date": "2028-12-31",
        "Cost Recurrence": "Recurrent",
        "Annual Value": 12000 // Rata Flat: Esattamente 1.000€ al mese
      };

      // TEST A: Mese Spezzato (Novembre ha 30 gg. Dal 16 al 30 sono 15 giorni)
      // Aspettativa ERP: (RataMensile / 30) * 15 = 500€
      const periodNov = new TimePeriod("NOV-26", "2026-11-01", "2026-11-30");
      const projNov = new ContractProjection(mockContract, periodNov, []);

      // TEST B: Mese Intero (Dicembre ha 31 gg)
      // Aspettativa ERP: Rata Flat = 1.000€ (NON deve fare calcoli sui 31 giorni)
      const periodDec = new TimePeriod("DEC-26", "2026-12-01", "2026-12-31");
      const projDec = new ContractProjection(mockContract, periodDec, []);

      assert.equal(projNov.calculateBaseline(), 500);
      assert.equal(projDec.calculateBaseline(), 1000);
      
      console.log("      [Check ERP]: Pro-Rata mensile applicato con successo.");
    }
  });

})();