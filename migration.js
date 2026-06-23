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
 * MACRO FUNZIONE 3: Aggiorna ENTRAMBI i fogli in un colpo solo.
 */
function backfillAllSheets() {
    console.log("MIGRAZIONE: Avvio backfill globale -> MASTER + DETTAGLI.");
    _runCoreMigrationEngine({ writeMaster: true, writeDetail: true });
}


/**
 * MOTORE CENTRALE DI CALCOLO AD ALTA AFFIDABILITÀ
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

        // Mappatura con normalizzazione dei tipi di dato (Date Object -> ISO String)
        const formattedDetailsForPayload = childDetails.map(d => {
            const camelCaseObj = {};
            for (let header in CONTRACT_FIELD_MAP) {
                const frontendKey = CONTRACT_FIELD_MAP[header];
                let rawValue = d[header];

                // SAFE DATE CHECK: Se Apps Script ha letto un oggetto Date, lo normalizziamo in stringa YYYY-MM-DD
                if (rawValue instanceof Date) {
                    rawValue = !isNaN(rawValue.getTime()) ? Utilities.formatDate(rawValue, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
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

        // Esecuzione ricalcolo logico
        const calculatedPayload = _calculateMasterMetricsInMemoryInternal(mockPayload);

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
            // Ripristina e protegge l'integrità dei vecchi contratti popolandoli di default
            if (!originalDetail["Commitment Allocation"] || String(originalDetail["Commitment Allocation"]).trim() === "") {
                originalDetail["Commitment Allocation"] = "Linear";
            }
            if (!originalDetail["Pricing Model"] || String(originalDetail["Pricing Model"]).trim() === "") {
                originalDetail["Pricing Model"] = "Flat";
            }
        });
    });

    // SCRITTURA MASSIVA BULK ONESHOT SUI FOGLI GOOGLE
    if (flags.writeMaster && allMasters.length > 0) {
        const masterOutputValues = allMasters.map(master => {
            return masterHeaders.map(header => {
                let val = master[header];
                if (["Master Start Date", "Master End Date"].includes(header)) {
                    if (val instanceof Date) {
                        return !isNaN(val.getTime()) ? Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
                    }
                    return val ? val : "";
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
                    if (val instanceof Date) {
                        return !isNaN(val.getTime()) ? Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
                    }
                    return val ? val : "";
                }
                return val !== undefined ? val : "";
            });
        });
        detailSheet.getRange(2, 1, detailOutputValues.length, detailHeaders.length).setValues(detailOutputValues);
        console.log("MIGRAZIONE: Foglio [CONTRACTS] sovrascritto con successo.");
    }

    console.log("MIGRAZIONE: Processo completato.");
}

/**
 * Replica locale di sicurezza della pipeline di calcolo
 * @private
 */
function _calculateMasterMetricsInMemoryInternal(payload) {
    const details = payload.details || [];
    const initiatives = payload.initiatives || [];
    const suppliers = payload.suppliers || [];
    const masterId = payload.masterId || "";
    const supplierName = payload.supplier || "";

    let computedBillingChannel = "";
    const supplierMatch = suppliers.find(s => String(s["Supplier"]).trim().toLowerCase() === String(supplierName).trim().toLowerCase());
    if (supplierMatch) computedBillingChannel = supplierMatch["Type"] || "";

    details.forEach(detailRow => {
        detailRow.assetName = payload.assetName || "";
        detailRow.supplier = payload.supplier || "";
        detailRow.billingChannel = computedBillingChannel;

        const itemHeaderObj = {};
        for (let header in CONTRACT_FIELD_MAP) {
            const frontendKey = CONTRACT_FIELD_MAP[header];
            if (detailRow[frontendKey] !== undefined) {
                itemHeaderObj[header] = detailRow[frontendKey];
            }
        }
        itemHeaderObj["Status"] = detailRow.status || "";

        const calculatedHeaderObj = calculateContractLogic(itemHeaderObj);

        detailRow.effectiveCommitment = calculatedHeaderObj["Effective Commitment"];
        detailRow.annualValue = calculatedHeaderObj["Annual Value"];
        detailRow.status = calculatedHeaderObj["Status"];
        detailRow.contractTerm = calculatedHeaderObj["Contract Term (Months)"];
        detailRow.endDate = calculatedHeaderObj["End Date"];
    });

    let minStartDate = null;
    let maxEndDate = null;
    let totalEffectiveCommitment = 0;
    let recurrentEffectiveCommitment = 0;
    let hasActiveContracts = false;

    details.forEach(c => {
        if (c.startDate) {
            const sDate = new Date(c.startDate);
            if (!isNaN(sDate.getTime()) && (!minStartDate || sDate < minStartDate)) minStartDate = sDate;
        }
        if (c.endDate) {
            const eDate = new Date(c.endDate);
            if (!isNaN(eDate.getTime()) && (!maxEndDate || eDate > maxEndDate)) maxEndDate = eDate;
        }
        totalEffectiveCommitment += parseFloat(c.effectiveCommitment) || 0;
        if (String(c.costRecurrence).trim().toLowerCase() === "recurrent") {
            recurrentEffectiveCommitment += parseFloat(c.effectiveCommitment) || 0;
        }
        if (String(c.status).trim().toUpperCase() === "ACTIVE") hasActiveContracts = true;
    });

    const computedMasterStartDateStr = minStartDate ? minStartDate.toISOString().split('T')[0] : "";
    const computedMasterEndDateStr = maxEndDate ? maxEndDate.toISOString().split('T')[0] : "";

    let computedContractTerm = 0;
    if (computedMasterStartDateStr && computedMasterEndDateStr) {
        const sDate = new Date(computedMasterStartDateStr);
        const eDate = new Date(computedMasterEndDateStr);
        const endPlusOne = new Date(eDate);
        endPlusOne.setDate(endPlusOne.getDate() + 1);
        computedContractTerm = (endPlusOne.getFullYear() - sDate.getFullYear()) * 12 + (endPlusOne.getMonth() - sDate.getMonth());
        if (computedContractTerm < 0) computedContractTerm = 0;
    }

    let computedRunRate = 0;
    if (recurrentEffectiveCommitment > 0 && computedContractTerm > 0) {
        computedRunRate = parseFloat(((recurrentEffectiveCommitment / computedContractTerm) * 12).toFixed(2));
    }

    let checkTerminated = 0;
    let checkNeg = 0;
    if (masterId && masterId.trim() !== "") {
        initiatives.forEach(init => {
            if (String(init["Master Contract ID"]).trim() === String(masterId).trim()) {
                const initStatus = String(init["Initiative Status"]).trim().toUpperCase();
                const decision = String(init["Decision"]).trim().toUpperCase();
                if (initStatus === "COMPLETED" && ["TERMINATE", "REPLACE", "TRANSFER"].includes(decision)) checkTerminated++;
                if (initStatus === "IN PROGRESS") checkNeg++;
            }
        });
    }

    let computedStatus = "EXPIRED";
    if (checkTerminated > 0) computedStatus = "TERMINATED";
    else if (hasActiveContracts) computedStatus = "ACTIVE";
    else if (checkNeg > 0) computedStatus = "IN NEGOTIATION";

    payload.status = computedStatus;
    payload.masterStartDate = computedMasterStartDateStr;
    payload.masterEndDate = computedMasterEndDateStr;
    payload.contractTerm = computedContractTerm;
    payload.totalCommitment = parseFloat(totalEffectiveCommitment.toFixed(2));
    payload.runRate = computedRunRate;
    payload.billingChannel = computedBillingChannel;

    return payload;
}

/**
 * RECOVERY SCRIPT: Identifica i Master ID corrotti con l'anno 1899.
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

    const masterOutputValues = allMasters.map(master => {
        return masterHeaders.map(header => {
            let val = master[header];
            if (["Master Start Date", "Master End Date"].includes(header)) {
                return val ? new Date(val) : "";
            }
            return val !== undefined ? val : "";
        });
    });

    const detailOutputValues = allDetails.map(detail => {
        return detailHeaders.map(header => {
            let val = detail[header];
            if (["Start Date", "Contract End Date", "Adjusted End Date", "End Date"].includes(header)) {
                return val ? new Date(val) : "";
            }
            return val !== undefined ? val : "";
        });
    });

    masterSheet.getRange(2, 1, masterOutputValues.length, masterHeaders.length).setValues(masterOutputValues);
    detailSheet.getRange(2, 1, detailOutputValues.length, detailHeaders.length).setValues(detailOutputValues);

    console.log("MIGRAZIONE COMPLETATA: Tutti i fogli sono stati riallineati con gli ID corretti.");
}