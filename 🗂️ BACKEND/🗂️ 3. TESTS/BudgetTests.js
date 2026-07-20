/**
 * ============================================================================
 * FINOPS UNIT TESTING: BUDGET DOMAIN TESTS (PURE DTO PATTERN)
 * ============================================================================
 */
(function () {
    const registry = GLOBAL_TEST_REGISTRY.budget;

    // --------------------------------------------------------------------------
    // TEST 1: TYPE SAFETY E PULIZIA DATI
    // --------------------------------------------------------------------------
    registry.push({
        description: "Allocation - Tolleranza Zero su tipi, spazi e uppercase per chiavi critiche",
        fn: function (assert) {
            const rawDataFromSheet = {
                allocationId: " ALL-123 ",        // Spazi vuoti da rimuovere
                supplier: " Microsoft Corp ",     // Spazi da rimuovere
                fiscalYear: " fy27 ",             // Deve diventare maiuscolo
                amount: "150000.50"               // Stringa che deve diventare un Float matematico
            };

            const allocation = new Allocation(rawDataFromSheet);
            const exported = allocation.exportToData();

            assert.equal(exported.allocationId, "ALL-123");
            assert.equal(exported.supplier, "Microsoft Corp");
            assert.equal(exported.fiscalYear, "FY27");
            assert.equal(exported.amount, 150000.5); // Validazione Type-Safe
        }
    });

    // --------------------------------------------------------------------------
    // TEST 2: PARSING DATE E STANDARD ISO
    // --------------------------------------------------------------------------
    registry.push({
        description: "AssetAllocationBridge - Date parsing sicuro e standardizzazione ISO 8601",
        fn: function (assert) {
            const rawDataFromSheet = {
                allocationId: "ALL-123",
                assetId: "AST-001",
                fiscalYear: "FY27",
                validFrom: "2026/01/01",         // Formato spigoloso
                validTo: "2026-12-31T10:00:00Z"  // Formato Timestamp completo
            };

            const bridge = new AssetAllocationBridge(rawDataFromSheet);
            const exported = bridge.exportToData();

            // Il metodo formatServerDate (ereditato dal sistema) deve spianare tutto a YYYY-MM-DD
            assert.equal(exported.validFrom, "2026-01-01");
            assert.equal(exported.validTo, "2026-12-31");
        }
    });

    // --------------------------------------------------------------------------
    // TEST 3: DATA PRESERVATION NEL REPOSITORY
    // --------------------------------------------------------------------------
    registry.push({
        description: "BudgetMapper - Data Preservation per le colonne sconosciute (Anti-Distruzione)",
        fn: function (assert) {
            const mockRawRow = {
                "Allocation ID": "ALL-999",
                "Supplier": "AWS",
                "Note Contabili Nascoste": "Non mi cancellare per favore"
            };

            const mockFieldMap = {
                "Allocation ID": "allocationId",
                "Supplier": "supplier"
            };

            // Simuliamo il passaggio dal repository
            const dto = BudgetMapper.toDto(mockRawRow, mockFieldMap);

            // Controlliamo che le traduzioni camelCase siano andate a buon fine
            assert.equal(dto.allocationId, "ALL-999");
            assert.equal(dto.supplier, "AWS");

            // RETE DI SICUREZZA: Controlliamo che la colonna non censita esista ancora
            assert.equal(dto["Note Contabili Nascoste"], "Non mi cancellare per favore");
        }
    });

})();