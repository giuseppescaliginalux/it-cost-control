/**
 * MACRO FUNZIONE 1: Aggiorna ESCLUSIVAMENTE il foglio MASTER CONTRACTS.
 */
function backfillMasterContractsOnly() {
    console.log("MIGRAZIONE: Avvio backfill selettivo -> Solo MASTER CONTRACTS.");
    _runCoreMigrationEngine({ writeMaster: true, writeDetail: false });
}

/**
 * MACRO FUNZIONE 2: Aggiorna ESCLUSIVAMENTE il foglio CONTRACTS (Dettagli).
 */
function backfillDetailContractsOnly() {
    console.log("MIGRAZIONE: Avvio backfill selettivo -> Solo DETTAGLI (CONTRACTS).");
    _runCoreMigrationEngine({ writeMaster: false, writeDetail: true });
}

/**
 * MACRO FUNZIONE 3: Aggiorna ENTRAMBI i fogli in un colpo solo e allinea Ledger e Proiezioni.
 */
function backfillAllSheets() {
    console.log("MIGRAZIONE: Avvio backfill globale -> MASTER + DETTAGLI.");
    _runCoreMigrationEngine({ writeMaster: true, writeDetail: true });

    console.log("MIGRAZIONE: Avvio allineamento a cascata di Ledger e Proiezioni...");
    if (typeof regenerateLedgerCalculatedProjections === "function") regenerateLedgerCalculatedProjections();
    if (typeof updateAllOfficialFiscalProjections === "function") updateAllOfficialFiscalProjections();

    console.log("MIGRAZIONE GLOBALE COMPLETATA CON SUCCESSO.");
}

/**
 * MOTORE CENTRALE DI CALCOLO AD ALTA AFFIDABILITÀ (Refattorizzato in logica DRY)
 * @private
 */
function _runCoreMigrationEngine(flags) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_CONTRACTS);
    const detailSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS);

    const allMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allDetails = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];
    const allSuppliers = getSheetDataAsObjects(ss, CONFIG.SHEETS.SUPPLIERS) || [];
    const allInitiatives = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];

    const masterHeaders = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
    const detailHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0];

    allMasters.forEach((master) => {
        const currentMasterId = String(master["Master Contract ID"]).trim();
        if (!currentMasterId) return;

        const childDetails = allDetails.filter(d => String(d["Master Contract ID"]).trim() === currentMasterId);

        // Mappatura con normalizzazione dei tipi di dato (Date Object -> ISO String pura)
        const formattedDetailsForPayload = childDetails.map(d => {
            const camelCaseObj = {};
            for (let header in CONTRACT_FIELD_MAP) {
                const frontendKey = CONTRACT_FIELD_MAP[header];
                let rawValue = d[header];

                if (["Start Date", "Contract End Date", "Adjusted End Date", "End Date"].includes(header)) {
                    rawValue = formatServerDate(rawValue); // <-- Motore unico centralizzato
                }

                camelCaseObj[frontendKey] = rawValue;
            }
            camelCaseObj.status = d["Status"] || "";
            return camelCaseObj;
        });

        const mockPayload = {
            masterId: currentMasterId,
            assetName: master["Asset Name"] || "",
            supplier: master["Supplier"],
            masterScope: master["Scope"],
            masterComments: master["Comments"],
            suppliers: allSuppliers,
            initiatives: allInitiatives,
            details: formattedDetailsForPayload
        };

        // CHIAMATA DIRETTA AL MOTORE IN LOGIC.JS (Applichiamo il principio DRY)
        const calculatedPayload = calculateMasterMetricsInMemory(mockPayload);

        // Sincronizzazione Master locale
        for (let header in MASTER_FIELD_MAP) {
            const frontendKey = MASTER_FIELD_MAP[header];
            if (calculatedPayload[frontendKey] !== undefined) {
                master[header] = calculatedPayload[frontendKey];
            }
        }

        // Sincronizzazione Dettagli locali
        childDetails.forEach((originalDetail, cIdx) => {
            const calculatedChild = calculatedPayload.details[cIdx];
            originalDetail["Asset Name"] = calculatedChild.assetName;
            originalDetail["Supplier"] = calculatedChild.supplier;
            originalDetail["Billing Channel"] = calculatedChild.billingChannel;
            originalDetail["Effective Commitment"] = calculatedChild.effectiveCommitment;
            originalDetail["Annual Value"] = calculatedChild.annualValue;
            originalDetail["Status"] = calculatedChild.status;
            originalDetail["Contract Term (Months)"] = calculatedChild.contractTerm;
            originalDetail["End Date"] = calculatedChild.endDate;

            // --- AUTOMATED BACKFILL CONGIUNTO ---
            if (!originalDetail["Billing Terms"] || String(originalDetail["Billing Terms"]).trim() === "") {
                originalDetail["Billing Terms"] = "Linear";
            }
            if (!originalDetail["Pricing Model"] || String(originalDetail["Pricing Model"]).trim() === "") {
                originalDetail["Pricing Model"] = "Flat";
            }
        });
    });

    // SCRITTURA MASSIVA BULK ONESHOT SUI FOGLI GOOGLE (Sicura contro il Timezone Bug)
    if (flags.writeMaster && allMasters.length > 0) {
        const masterOutputValues = allMasters.map(master => {
            return masterHeaders.map(header => {
                let val = master[header];
                if (["Master Start Date", "Master End Date"].includes(header)) {
                    return formatServerDate(val);
                }
                return val !== undefined ? val : "";
            });
        });
        masterSheet.getRange(2, 1, masterOutputValues.length, masterHeaders.length).setValues(masterOutputValues);
        console.log("MIGRAZIONE: Foglio [MASTER CONTRACTS] sovrascritto con successo.");
    }

    if (flags.writeDetail && allDetails.length > 0) {
        const detailOutputValues = allDetails.map(detail => {
            return detailHeaders.map(header => {
                let val = detail[header];
                if (["Start Date", "Contract End Date", "Adjusted End Date", "End Date"].includes(header)) {
                    return formatServerDate(val);
                }
                return val !== undefined ? val : "";
            });
        });
        detailSheet.getRange(2, 1, detailOutputValues.length, detailHeaders.length).setValues(detailOutputValues);
        console.log("MIGRAZIONE: Foglio [CONTRACTS] sovrascritto con successo.");
    }
}

/**
 * RECOVERY SCRIPT: Identifica i Master ID corrotti con l'anno 1899.
 * CORRETTO: Adesso esporta correttamente le stringhe YYYY-MM-DD senza reimmettere i bug del fuso orario.
 */
function fixAndRegenerateMasterIds() {
    console.log("MIGRAZIONE: Avvio ripristino Master Contract ID (Rimozione anno 1899)...");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_CONTRACTS);
    const detailSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS);

    const allMasters = getSheetDataAsObjects(ss, CONFIG.SHEETS.MASTER_CONTRACTS) || [];
    const allDetails = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];

    const masterHeaders = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
    const detailHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0];

    let fixedCount = 0;
    const idTranslationMap = {};

    allMasters.forEach(master => {
        const oldId = String(master["Master Contract ID"]).trim();
        if (!oldId) return;

        if (oldId.includes("-1899-")) {
            const childDetails = allDetails.filter(d => String(d["Master Contract ID"]).trim() === oldId);

            let minStartDate = null;
            childDetails.forEach(d => {
                let rawDate = d["Start Date"];
                if (rawDate) {
                    const sDate = new Date(rawDate);
                    if (!isNaN(sDate.getTime()) && sDate.getFullYear() > 1900) {
                        if (!minStartDate || sDate < minStartDate) {
                            minStartDate = sDate;
                        }
                    }
                }
            });

            let correctYear = "2026";
            if (minStartDate) {
                correctYear = minStartDate.getFullYear().toString();
            } else if (master["Master Start Date"]) {
                const mDate = new Date(master["Master Start Date"]);
                if (!isNaN(mDate.getTime()) && mDate.getFullYear() > 1900) {
                    correctYear = mDate.getFullYear().toString();
                }
            }

            const parts = oldId.split("-");
            if (parts.length >= 5) {
                parts[parts.length - 2] = correctYear;
                const newId = parts.join("-");

                console.log(`TRADUZIONE: '${oldId}' ---> '${newId}'`);

                idTranslationMap[oldId] = newId;
                master["Master Contract ID"] = newId;
                fixedCount++;
            }
        }
    });

    if (fixedCount === 0) {
        console.log("MIGRAZIONE: Nessun ID corrotto con anno 1899 rilevato. I fogli sono già puliti.");
        return;
    }

    let detailUpdatedCount = 0;
    allDetails.forEach(detail => {
        const currentRefId = String(detail["Master Contract ID"]).trim();
        if (idTranslationMap[currentRefId]) {
            detail["Master Contract ID"] = idTranslationMap[currentRefId];
            detailUpdatedCount++;
        }
    });

    console.log(`MIGRAZIONE: Rigenerati ${fixedCount} Master ID. Aggiornati di riflesso ${detailUpdatedCount} contratti di dettaglio.`);

    // FIX DATE PER LA SCRITTURA 
    const masterOutputValues = allMasters.map(master => {
        return masterHeaders.map(header => {
            let val = master[header];
            if (["Master Start Date", "Master End Date"].includes(header)) {
                return formatServerDate(val);
            }
            return val !== undefined ? val : "";
        });
    });

    const detailOutputValues = allDetails.map(detail => {
        return detailHeaders.map(header => {
            let val = detail[header];
            if (["Start Date", "Contract End Date", "Adjusted End Date", "End Date"].includes(header)) {
                return formatServerDate(val);
            }
            return val !== undefined ? val : "";
        });
    });

    masterSheet.getRange(2, 1, masterOutputValues.length, masterHeaders.length).setValues(masterOutputValues);
    detailSheet.getRange(2, 1, detailOutputValues.length, detailHeaders.length).setValues(detailOutputValues);

    console.log("MIGRAZIONE COMPLETATA: Tutti i fogli sono stati riallineati con gli ID corretti.");
}

/**
 * MACRO FUNZIONE 4: Ricalcola e aggiorna ESCLUSIVAMENTE il foglio INITIATIVES.
 * Legge i dati attuali dai fogli, applica le regole di business (Saving, Baseline, Actuals) e sovrascrive.
 */
function backfillInitiativesOnly() {
    console.log("MIGRAZIONE: Avvio ricalcolo massivo -> Solo INIZIATIVE.");
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const initSheet = ss.getSheetByName(CONFIG.SHEETS.INITIATIVES || "Initiatives");
    if (!initSheet) {
        console.error("ERRORE: Foglio Initiatives non trovato.");
        return;
    }

    // 1. Estrae i dati correnti direttamente dai fogli Google
    const allInits = getSheetDataAsObjects(ss, CONFIG.SHEETS.INITIATIVES) || [];
    const allContracts = getSheetDataAsObjects(ss, CONFIG.SHEETS.CONTRACTS) || [];

    if (allInits.length === 0) {
        console.log("Nessuna iniziativa trovata da ricalcolare.");
        return;
    }

    // 2. Ricalcola tutti i valori (Baseline, Savings, Actuals, %) usando il motore nativo in logic.js
    const updatedInits = calculateInitiativesMetrics(allInits, allContracts);

    // 3. Prepara la matrice dei dati per la scrittura bulk
    const initContext = getSheetContext(CONFIG.SHEETS.INITIATIVES);
    const initHeaders = initContext.headers;
    
    const rowsToAdd = updatedInits.map(init => {
        return initHeaders.map(h => {
            let val = init[h];
            if (["Target Date", "Actual Date"].includes(h) && val) {
                return formatServerDate(val); 
            }
            return val !== undefined && val !== null ? val : "";
        });
    });

    // 4. Sovrascrive i dati sul foglio
    initSheet.getRange(2, 1, rowsToAdd.length, initHeaders.length).setValues(rowsToAdd);
    console.log("MIGRAZIONE: Foglio [INITIATIVES] ricalcolato e sovrascritto con successo.");

    // 5. Ricalcola le proiezioni a cascata (necessario perché i saving potrebbero essere cambiati)
    console.log("MIGRAZIONE: Avvio allineamento a cascata delle Proiezioni Fiscali...");
    if (typeof updateAllOfficialFiscalProjections === "function") {
        updateAllOfficialFiscalProjections();
    }

    console.log("RICALCOLO INIZIATIVE COMPLETATO CON SUCCESSO.");
}