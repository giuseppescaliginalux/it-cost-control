/**
 * commands_engine.gs
 * Motore di proiezione definitivo con calcolo basato sui mesi effettivi delle finestre temporali.
 */

function generateProjections() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ledgerSheet = ss.getSheetByName("TimeWindowLedger");
    const contractSheet = ss.getSheetByName("Contracts");

    const contractData = contractSheet.getDataRange().getValues();
    const ledgerData = ledgerSheet.getDataRange().getValues();

    const cHeaders = contractData[0];
    const idxC = {
        cId: cHeaders.indexOf("Group ID"),
        cTotal: cHeaders.indexOf("Total Commitment"),
        cModel: cHeaders.indexOf("Pricing Model"),
        cStart: cHeaders.indexOf("Start Date"),
        cEnd: cHeaders.indexOf("Contract End Date"),
        cStatus: cHeaders.indexOf("Status")
    };

    const lHeaders = ledgerData[0];
    const idxL = {
        lId: lHeaders.indexOf("Group ID"),
        lStart: lHeaders.indexOf("Start Date"),
        lEnd: lHeaders.indexOf("End Date"),
        lAmount: lHeaders.indexOf("Amount"),
        lType: lHeaders.indexOf("Type")
    };

    // 1. ELIMINAZIONE RIGHE "CALCULATED"
    for (let i = ledgerData.length - 1; i > 0; i--) {
        if (ledgerData[i][idxL.lType] === "CALCULATED") {
            ledgerSheet.deleteRow(i + 1);
        }
    }

    const cleanLedgerData = ledgerSheet.getDataRange().getValues();
    const newRows = [];

    // 2. ELABORAZIONE CONTRATTI ACTIVE
    for (let i = 1; i < contractData.length; i++) {
        const row = contractData[i];
        if (row[idxC.cStatus] !== "ACTIVE") continue;

        const gid = row[idxC.cId];
        const model = row[idxC.cModel];
        if (!gid || (model !== "Flat" && model !== "Minimum Consumption" && model !== "Pure Consumption")) continue;

        const contractStart = new Date(row[idxC.cStart]);
        const contractEnd = new Date(row[idxC.cEnd]);

        const existing = cleanLedgerData.filter(r => r[idxL.lId] === gid);
        const actuals = existing.filter(r => r[idxL.lType] === "ACTUAL");

        const missingMonths = getMissingMonthsStrict(contractStart, contractEnd, existing, idxL);
        if (missingMonths.length === 0) continue;

        // Calcolo dei mesi reali coperti dagli ACTUAL (Risolve il bug delle cifre giganti)
        let totalActualMonths = 0;
        let totalActualAmount = 0;

        actuals.forEach(r => {
            totalActualMonths += countMonthsBetween(r[idxL.lStart], r[idxL.lEnd]);
            totalActualAmount += (parseFloat(r[idxL.lAmount]) || 0);
        });

        const avgMonthlyRate = totalActualMonths > 0 ? (totalActualAmount / totalActualMonths) : 0;

        // --- LOGICA MODELLO: PURE CONSUMPTION ---
        if (model === "Pure Consumption") {
            if (totalActualMonths > 0) {
                missingMonths.forEach(m => {
                    newRows.push([gid, formatDate(m.start), formatDate(m.end), "CALCULATED", avgMonthlyRate]);
                });
            }
        }

        // --- LOGICA MODELLO: MINIMUM CONSUMPTION ---
        else if (model === "Minimum Consumption") {
            const totalExistingAmount = existing.reduce((sum, r) => sum + (parseFloat(r[idxL.lAmount]) || 0), 0);
            const totalCommitment = parseFloat(row[idxC.cTotal]) || 0;
            const remainingBudget = Math.max(0, totalCommitment - totalExistingAmount);

            const contractTotalMonths = countMonthsBetween(contractStart, contractEnd);
            const defaultMonthlyRate = contractTotalMonths > 0 ? (totalCommitment / contractTotalMonths) : 0;
            const currentAvgRate = totalActualMonths > 0 ? avgMonthlyRate : defaultMonthlyRate;

            // Proiezione a fine contratto considerando la spesa attuale + i mesi mancanti stimati alla media corrente
            const projectedTotalAtEnd = totalExistingAmount + (missingMonths.length * currentAvgRate);

            let finalMonthlyRate;
            if (projectedTotalAtEnd > totalCommitment) {
                finalMonthlyRate = currentAvgRate; // Mantiene la media reale se superiore
            } else {
                finalMonthlyRate = missingMonths.length > 0 ? (remainingBudget / missingMonths.length) : 0; // Forza il raggiungimento del commitment
            }

            missingMonths.forEach(m => {
                newRows.push([gid, formatDate(m.start), formatDate(m.end), "CALCULATED", finalMonthlyRate]);
            });
        }
    }

    // 3. SCRITTURA BULK
    if (newRows.length > 0) {
        ledgerSheet.getRange(ledgerSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    }
}

/**
 * Helper per calcolare i mesi mancanti scoperti
 */
function getMissingMonthsStrict(start, end, existing, idxL) {
    const missing = [];
    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
        const month = current.getMonth();
        const year = current.getFullYear();

        const isCovered = existing.some(r => {
            const rStart = new Date(r[idxL.lStart]);
            const rEnd = new Date(r[idxL.lEnd]);
            return current >= new Date(rStart.getFullYear(), rStart.getMonth(), 1) &&
                current <= new Date(rEnd.getFullYear(), rEnd.getMonth(), 1);
        });

        if (!isCovered) {
            missing.push({
                start: new Date(year, month, 1),
                end: new Date(year, month + 1, 0)
            });
        }
        current.setMonth(current.getMonth() + 1);
    }
    return missing;
}

/**
 * Helper per contare quanti mesi effettivi ci sono in una finestra temporale
 */
function countMonthsBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function formatDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
}