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
  
})();