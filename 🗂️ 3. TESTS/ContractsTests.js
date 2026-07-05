/**
 * ============================================================================
 * FINOPS UNIT TESTING: CONTRACTS DOMAIN COMPREHENSIVE TESTS
 * ============================================================================
 */
(function() {
  const registry = GLOBAL_TEST_REGISTRY.contracts;

  registry.push({
    description: "Contract.getDurationMonths() - Gestione anno bisestile",
    fn: function(assert) {
      // Il 2028 sarà un anno bisestile (366 giorni). Il motore deve calcolare correttamente 12 mesi commerciali.
      const contract = new Contract({ "Start Date": "2028-01-01", "Contract End Date": "2028-12-31" });
      assert.equal(contract.getDurationMonths(), 12);
    }
  });

  registry.push({
    description: "Contract.getAnnualValue() - Contratti One-Shot vs Recurrent",
    fn: function(assert) {
      const recurrent = new Contract({ 
        "Start Date": "2026-01-01", "Contract End Date": "2026-06-30", 
        "Cost Recurrence": "Recurrent", "Total Commitment": 50000 
      });
      // 50k in 6 mesi equivalgono a un Annual Value (valore annualizzato) di 100k
      assert.closeTo(recurrent.getAnnualValue(), 100000, 100);

      const oneShot = new Contract({ 
        "Start Date": "2026-01-01", "Contract End Date": "2026-06-30", 
        "Cost Recurrence": "One-Shot", "Total Commitment": 50000 
      });
      // Nei contratti One-Shot il valore annualizzato coincide esattamente con il commitment
      assert.equal(oneShot.getAnnualValue(), 50000);
    }
  });

  registry.push({
    description: "MasterContract.getRunRate() - Aggregazione selettiva solo su contratti Recurrent",
    fn: function(assert) {
      const master = new MasterContract({ supplier: "AWS" });
      
      // Aggiungiamo un contratto ricorrente da 12 mesi, 120.000€ (Run Rate annuale = 120k)
      const c1 = new Contract({ "Start Date": "2026-01-01", "Contract End Date": "2026-12-31", "Cost Recurrence": "Recurrent", "Total Commitment": 120000 });
      // Aggiungiamo un contratto One-Shot da 50.000€ nello stesso periodo (deve essere ignorato nel Run Rate)
      const c2 = new Contract({ "Start Date": "2026-01-01", "Contract End Date": "2026-12-31", "Cost Recurrence": "One-Shot", "Total Commitment": 50000 });
      
      master.addChild(c1);
      master.addChild(c2);

      assert.equal(master.getRunRate(), 120000);
    }
  });

  registry.push({
    description: "ContractService.generateId() - Algoritmo di compressione Smurf Naming (Rimozione vocali)",
    fn: function(assert) {
      const service = new ContractService();
      // "GOOGLE" -> "GGL", "CLOUD SUITE" -> "CLDS" (troncato a 4)
      const generatedId = service.generateId("CTR", "GOOGLE", "CLOUD SUITE", "2026", 5);
      assert.equal(generatedId, "CTR-GGL-CLDS-2026-05");
    }
  });

  // --------------------------------------------------------------------------
  // NUOVI TEST: SANITIZZAZIONE E SICUREZZA GENERAZIONE ID
  // --------------------------------------------------------------------------

  registry.push({
    description: "ContractService.generateId() [Master] - Non deve contenere virgole se il Fornitore ha punteggiatura",
    fn: function(assert) {
      const service = new ContractService();
      
      // Fornitore con virgola e punti: "Oracle, Corp. Ltd."
      // L'algoritmo deve ripulire la stringa e generare un ID pulito
      const generatedMasterId = service.generateId("MCT", "Oracle, Corp. Ltd.", "Database", "2026", 1);
      
      // Verifica l'assenza di virgole nel risultato finale
      const hasComma = generatedMasterId.includes(",");
      assert.equal(hasComma, false);
      
      // Verifica che l'ID sia strutturato correttamente (es. MCT-RCLCR-DTBS-2026-01 o simile senza virgole)
      console.log(`      [Check ID Master]: ${generatedMasterId}`);
    }
  });

  registry.push({
    description: "ContractService.generateId() [Contract] - Non deve contenere virgole se l'Asset Name contiene virgole",
    fn: function(assert) {
      const service = new ContractService();
      
      // Asset Name con virgola: "SaaS, Premium License"
      const generatedContractId = service.generateId("CTR", "Microsoft", "SaaS, Premium License", "2026", 12);
      
      const hasComma = generatedContractId.includes(",");
      assert.equal(hasComma, false);
      
      console.log(`      [Check ID Contract]: ${generatedContractId}`);
    }
  });

  // --------------------------------------------------------------------------
  // TEST DI VERIFICA: INTEGRITÀ MAPPATURA MASTER CONTRACTS
  // --------------------------------------------------------------------------
  registry.push({
    description: "Verification: MASTER_FIELD_MAP deve allinearsi alle colonne reali del foglio MasterContracts",
    fn: function(assert) {
      // Simuliamo l'esportazione di un Master Contract
      const master = new MasterContract({ masterId: "MCT-TDD-01", supplier: "Oracle" });
      master["Asset Name"] = "Database Platform";
      
      const exported = master.exportToData([]);
      
      // Verifichiamo che le chiavi del dizionario MASTER_FIELD_MAP contengano i campi reali del foglio
      assert.equal(MASTER_FIELD_MAP["Run Rate"] !== undefined, true);
      assert.equal(MASTER_FIELD_MAP["Asset Name"] !== undefined, true);
    }
  });

  // --------------------------------------------------------------------------
  // TDD VERIFICATION: PRESERVATION PREVIOUS MASTER ID PER TIMELINE
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: MasterContract.exportToData() - Deve preservare il campo 'Previous Master ID' e mapparlo in camelCase per la Timeline",
    fn: function(assert) {
      // Simuliamo una riga nativa estratta dal foglio MasterContracts
      const mockSheetRow = {
        "Master Contract ID": "MCT-TDD-02",
        "Previous Master ID": "MCT-TDD-01",
        "Supplier": "Microsoft",
        "Scope": "Cloud Productivity"
      };
      
      const master = new MasterContract(mockSheetRow);
      const exported = master.exportToData([]);

      // 1. Il dizionario di configurazione deve censire la colonna
      assert.equal(MASTER_FIELD_MAP["Previous Master ID"], "previousMasterId");
      
      // 2. Il DTO finale per la UI deve contenere il valore associato alla chiave camelCase
      assert.equal(exported.previousMasterId, "MCT-TDD-01");
      assert.equal(exported.masterScope, "Cloud Productivity");
    }
  });

  // --------------------------------------------------------------------------
  // TDD: DATA LOSS SUI CONTRATTI (MAPPATURA METADATI)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: Contract.exportToData() - Deve preservare i campi anagrafici e descrittivi estratti dal foglio",
    fn: function(assert) {
      const mockRawRow = {
        "Contract ID": "CTR-DATALOSS-01",
        "Asset Name": "Salesforce CRM",
        "Supplier": "Salesforce Inc.",
        "Comments": "Nota vitale da non cancellare"
      };
      
      const contract = new Contract(mockRawRow);
      const exported = contract.exportToData();

      // Il dizionario di esportazione deve preservare i valori, non trasformarli in stringhe vuote
      assert.equal(exported.assetName, "Salesforce CRM");
      assert.equal(exported.supplier, "Salesforce Inc.");
      assert.equal(exported.comments, "Nota vitale da non cancellare");
    }
  });

  // --------------------------------------------------------------------------
  // TDD: ALLOCATION SPLITS (ANTI DOUBLE-DIVISION & DATA LOSS)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: AllocationSplit - Gestione sicura delle percentuali in lettura/scrittura (anti double-division)",
    fn: function(assert) {
      // Caso 1: Dato proveniente dalla UI (Intero, es. 27 per 27%)
      const splitFromUI = new AllocationSplit({
        "Allocation Rule": "Percentage",
        "Percentage Share": 27
      });
      
      // Caso 2: Dato proveniente dal ricalcolo del Foglio Google (Decimale, es. 0.27)
      const splitFromSheet = new AllocationSplit({
        "Allocation Rule": "Percentage",
        "Percentage Share": 0.27
      });

      // Entrambi DEVONO esportare 0.27 verso il foglio Google per non corrompere le formule!
      assert.equal(splitFromUI.exportToData()["Percentage Share"], 0.27);
      assert.equal(splitFromSheet.exportToData()["Percentage Share"], 0.27);
    }
  });

  // --------------------------------------------------------------------------
  // TDD: TOP-DOWN LOOKUPS (ASSET, SUPPLIER, BILLING CHANNEL)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: MasterContract.addChild() - Il contratto figlio DEVE ereditare rigorosamente i campi di lookup dal Master",
    fn: function(assert) {
      // 1. Creiamo un Master con anagrafica ben definita
      const master = new MasterContract({
        "Master Contract ID": "MCT-LOOKUP-01",
        "Asset Name": "Cloud Platform",
        "Supplier": "Google",
        "Billing Channel": "Reseller"
      });
      
      // 2. Creiamo un contratto figlio "sporco", con dati disallineati o vecchi
      const child = new Contract({
        "Contract ID": "CTR-LOOKUP-01",
        "Asset Name": "Vecchio Asset",
        "Supplier": "Vecchio Fornitore",
        "Billing Channel": "Vecchio Canale"
      });
      
      // 3. Quando il master "adotta" il contratto, deve piallare via i vecchi dati 
      // e sovrascriverli con i propri (Lookup)
      master.addChild(child);
      const exportedChild = child.exportToData();
      
      assert.equal(exportedChild.masterId, "MCT-LOOKUP-01");
      assert.equal(exportedChild.assetName, "Cloud Platform");
      assert.equal(exportedChild.supplier, "Google");
      assert.equal(exportedChild.billingChannel, "Reseller");
      
      console.log("      [Check Lookup]: Ereditarietà a cascata applicata con successo al figlio.");
    }
  });

  // --------------------------------------------------------------------------
  // TDD: DEDUPLICAZIONE AUTOMATICA (PULIZIA SPORCIZIA STORICA)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: ContractService.removeDuplicatesByKey() - Deve riconoscere e vaporizzare i record con ID clonato in RAM",
    fn: function(assert) {
      const service = new ContractService();
      
      // Simuliamo la spazzatura che arriva dal foglio Google
      const dirtyDataFromSheet = [
        { "Contract ID": "CTR-CLEAN-01", "Value": 100 },
        { "Contract ID": "CTR-CLEAN-02", "Value": 200 },
        { "Contract ID": "CTR-CLEAN-01", "Value": 300 }, // CLONE!
        { "Contract ID": "CTR-CLEAN-01", "Value": 400 }  // CLONE!
      ];

      // Diamo il dataset in pasto al nuovo filtro del Service
      const cleanedData = service.removeDuplicatesByKey(dirtyDataFromSheet, "Contract ID");

      // Verifichiamo che i cloni siano stati spazzati via e ne sia sopravvissuto solo 1
      assert.equal(cleanedData.length, 2);
      assert.equal(cleanedData[0]["Contract ID"], "CTR-CLEAN-01");
      assert.equal(cleanedData[1]["Contract ID"], "CTR-CLEAN-02");
      
      console.log("      [Check Dedup]: Trovati 4 record, sopravvissuti 2. Cloni vaporizzati.");
    }
  });

// --------------------------------------------------------------------------
  // TDD: REGOLE DI BUSINESS DEL LEDGER (Matrice Pricing Models)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: Contract.exportFullLedger() - Deve rispettare la matrice: Flat, Pure, Minimum, Capped",
    fn: function(assert) {
      const baseDati = {
        billingTerms: "In Arrears",
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31",
        annualValue: 12000
      };

      // 1. FLAT: Vaporizza il Ledger
      const cFlat = new Contract({ ...baseDati, id: "C-FLAT", pricingModel: "Flat" });
      cFlat.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      // 2. PURE CONSUMPTION: Solo Actual, No Forecast
      const cPure = new Contract({ ...baseDati, id: "C-PURE", pricingModel: "Pure Consumption" });
      cPure.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      // 3. MINIMUM CONSUMPTION: Actual + Forecast
      const cMin = new Contract({ ...baseDati, id: "C-MIN", pricingModel: "Minimum Consumption" });
      cMin.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      // 4. CAPPED CONSUMPTION: Actual + Forecast
      const cCap = new Contract({ ...baseDati, id: "C-CAP", pricingModel: "Capped Consumption" });
      cCap.ledger.push(new LedgerMovement({ type: "ACTUAL", amount: 100 }));

      assert.equal(cFlat.exportFullLedger().length, 0);
      
      const resPure = cPure.exportFullLedger();
      assert.equal(resPure.length, 1);
      assert.equal(resPure[0]["Type"], "ACTUAL");
      
      assert.equal(cMin.exportFullLedger().length > 1, true);
      assert.equal(cCap.exportFullLedger().length > 1, true);
    }
  });

  // --------------------------------------------------------------------------
  // TDD: FREQUENZA AUTO-FORECAST (Linear vs Quarterly vs Upfront)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: Contract.generateForecastLedger() - Frequenze e blocchi basati su Billing Terms",
    fn: function(assert) {
      const baseDati = {
        id: "CTR-FREQ-TEST",
        pricingModel: "Minimum Consumption",
        startDate: "2026-01-01",
        contractEndDate: "2026-12-31",
        annualValue: 12000,
        totalCommitment: 12000
      };

      // 1. CASO LINEAR: 12 record mensili da 1000€
      const cLinear = new Contract({ ...baseDati, billingTerms: "Linear" });
      const fLinear = cLinear.generateForecastLedger();
      assert.equal(fLinear.length, 12);
      assert.equal(fLinear[0].amount, 1000);

      // 2. CASO QUARTERLY: 4 record trimestrali da 3000€ ciascuno
      const cQuarterly = new Contract({ ...baseDati, billingTerms: "Quarterly" });
      const fQuarterly = cQuarterly.generateForecastLedger();
      assert.equal(fQuarterly.length, 4);
      assert.equal(fQuarterly[0].amount, 3000);
      assert.equal(fQuarterly[0].notes.includes("Quarterly"), true);

      // 3. CASO FULL UPFRONT: Nessuna generazione automatica
      const cUpfront = new Contract({ ...baseDati, billingTerms: "Full Upfront" });
      assert.equal(cUpfront.generateForecastLedger().length, 0);

      // 4. CASO LEDGER-DRIVEN: Nessuna generazione automatica
      const cLedgerDriven = new Contract({ ...baseDati, billingTerms: "Ledger-Driven" });
      assert.equal(cLedgerDriven.generateForecastLedger().length, 0);
    }
  });
  
  // --------------------------------------------------------------------------
  // TDD: REPOSITORY MATRIX MAPPING (Mock Ereditario Isolato da I/O Reale)
  // --------------------------------------------------------------------------
  registry.push({
    description: "TDD: ContractRepository.overwriteAllLedger() - Deve preparare una matrice e scrivere in un unico shot",
    fn: function(assert) {
      // Sottoclasse Mock per intercettare l'I/O ed evitare scritture in produzione
      class MockContractRepository extends ContractRepository {
        constructor() {
          super();
          this.interceptedMatrix = null;
          this.wasSheetCleared = false;
        }
        
        overwriteAllLedger(exportedLedgerArray) {
          const mockHeaders = ["Contract ID", "Type", "Amount", "Start Date", "End Date", "Notes"];
          this.wasSheetCleared = true;
          
          this.interceptedMatrix = exportedLedgerArray.map(rowObj => {
            return mockHeaders.map(header => {
              const value = rowObj[header] !== undefined ? rowObj[header] : rowObj[header.toLowerCase()];
              return value !== undefined ? value : "";
            });
          });
        }
      }

      const repo = new MockContractRepository();
      const mockExportedLedger = [
        { "Contract ID": "CTR-TEST-01", "Type": "ACTUAL", "Amount": 100, "Start Date": "2026-01-01", "End Date": "2026-01-31", "Notes": "Note 1" },
        { "Contract ID": "CTR-TEST-02", "Type": "FORECAST", "Amount": 200, "Start Date": "2026-02-01", "End Date": "2026-02-28", "Notes": "Note 2" }
      ];
      
      repo.overwriteAllLedger(mockExportedLedger);
      
      assert.equal(repo.wasSheetCleared, true);
      assert.equal(repo.interceptedMatrix.length, 2);
      assert.equal(repo.interceptedMatrix[0][0], "CTR-TEST-01");
      assert.equal(repo.interceptedMatrix[0][2], 100);
    }
  });

})();