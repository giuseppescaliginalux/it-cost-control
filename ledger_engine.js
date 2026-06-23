/**
 * ledger_engine.js
 * Sotto-modulo focalizzato esclusivamente sulla salute e sulla predizione del registro delle eccezioni (Ledger).
 * Rigenera i forecast di cassa [CALCULATED] ESCLUSIVAMENTE per i contratti Minimum Consumption + Ledger-Driven.
 */

function regenerateLedgerCalculatedProjections() {
  console.log("LEDGER ENGINE: Avvio rigenerazione proiezioni predittive...");
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName("Ledger");
  const contractSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS || "Contracts");

  if (!ledgerSheet || !contractSheet) {
    console.error("LEDGER ENGINE ERRORE: Fogli Ledger o Contracts non trovati.");
    return;
  }

  let ledgerData = ledgerSheet.getDataRange().getValues();
  const contractData = contractSheet.getDataRange().getValues();

  const cHeaders = contractData[0];
  const idxC = {
    cId: cHeaders.indexOf("Group ID"), cTotal: cHeaders.indexOf("Total Commitment"), cModel: cHeaders.indexOf("Pricing Model"),
    allocation: cHeaders.indexOf("Commitment Allocation"), cStart: cHeaders.indexOf("Start Date"),
    cEnd: cHeaders.indexOf("End Date") !== -1 ? cHeaders.indexOf("End Date") : cHeaders.indexOf("Contract End Date"), cStatus: cHeaders.indexOf("Status")
  };

  const lHeaders = ledgerData[0];
  const idxL = { lId: lHeaders.indexOf("Group ID"), lStart: lHeaders.indexOf("Start Date"), lEnd: lHeaders.indexOf("End Date"), lAmount: lHeaders.indexOf("Amount"), lType: lHeaders.indexOf("Type") };

  // 1. Purge massivo preventivo di tutte le vecchie righe CALCULATED
  for (let i = ledgerData.length - 1; i > 0; i--) {
    if (String(ledgerData[i][idxL.lType]).trim().toUpperCase() === "CALCULATED") {
      ledgerSheet.deleteRow(i + 1);
    }
  }

  const cleanLedgerData = ledgerSheet.getDataRange().getValues();
  const newRows = [];

  // 2. Loop predittivo sui contratti attivi
  for (let i = 1; i < contractData.length; i++) {
    const row = contractData[i];
    if (String(row[idxC.cStatus]).trim().toUpperCase() !== "ACTIVE") continue;

    const gid = String(row[idxC.cId]).trim();
    const model = String(row[idxC.cModel]).trim();
    const allocation = String(row[idxC.allocation]).trim();
    
    if (!gid) continue;
    
    // SBARRAMENTO ATOMICO CONCORDATO: Rigenera solo per Minimum Consumption ad allocazione manuale.
    // I contratti Flat Upfront passano oltre senza generare costi fantasma ricorrenti mensili.
    if (model !== "Minimum Consumption" || allocation !== "Ledger-Driven") continue; 

    const contractStart = _leParseSafeDate(row[idxC.cStart]);
    const contractEnd = _leParseSafeDate(row[idxC.cEnd]);
    if (!contractStart || !contractEnd) continue;

    const existing = cleanLedgerData.filter(r => String(r[idxL.lId]).trim() === gid);
    const actuals = existing.filter(r => String(r[idxL.lType]).trim().toUpperCase() === "ACTUAL");

    const missingMonths = _leGetMissingMonthsStrict(contractStart, contractEnd, existing, idxL);
    if (missingMonths.length === 0) continue;

    let totalActualMonths = 0;
    let totalActualAmount = 0;

    actuals.forEach(r => {
      totalActualMonths += _leCountMonths(r[idxL.lStart], r[idxL.lEnd]);
      totalActualAmount += (parseFloat(String(r[idxL.lAmount]).replace(/[^0-9.-]+/g, "")) || 0);
    });

    const avgMonthlyRate = totalActualMonths > 0 ? (totalActualAmount / totalActualMonths) : 0;

    const totalExistingAmount = existing.reduce((sum, r) => sum + (parseFloat(String(r[idxL.lAmount]).replace(/[^0-9.-]+/g, "")) || 0), 0);
    const totalCommitment = parseFloat(String(row[idxC.cTotal]).replace(/[^0-9.-]+/g, "")) || 0;
    const remainingBudget = Math.max(0, totalCommitment - totalExistingAmount);

    const contractTotalMonths = _leCountMonths(contractStart, contractEnd);
    const defaultMonthlyRate = contractTotalMonths > 0 ? (totalCommitment / contractTotalMonths) : 0;
    const currentAvgRate = totalActualMonths > 0 ? avgMonthlyRate : defaultMonthlyRate;

    const projectedTotalAtEnd = totalExistingAmount + (missingMonths.length * currentAvgRate);

    let finalMonthlyRate = (projectedTotalAtEnd > totalCommitment) ? currentAvgRate : (missingMonths.length > 0 ? (remainingBudget / missingMonths.length) : 0);

    missingMonths.forEach(m => {
      newRows.push([gid, _leFormatDate(m.start), _leFormatDate(m.end), "CALCULATED", Math.round(finalMonthlyRate * 100) / 100]);
    });
  }

  if (newRows.length > 0) {
    ledgerSheet.getRange(ledgerSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    console.log(`LEDGER ENGINE: Generate con successo ${newRows.length} righe predittive.`);
  }
}

// --- HELPER PRIVATI ISOLATI PER IL LEDGER ---
function _leParseSafeDate(d) {
  if (!d) return null; if (d instanceof Date) return !isNaN(d.getTime()) ? d : null;
  const s = String(d).trim(); if (!s) return null;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
    const p = s.split(/[\/\-]/); return new Date(parseInt(p[2],10), parseInt(p[1],10)-1, parseInt(p[0],10));
  }
  const prs = new Date(s); return !isNaN(prs.getTime()) ? prs : null;
}

function _leGetMissingMonthsStrict(start, end, existing, idxL) {
  const missing = []; let current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    const month = current.getMonth(); const year = current.getFullYear();
    const isCovered = existing.some(r => {
      const rStart = _leParseSafeDate(r[idxL.lStart]); const rEnd = _leParseSafeDate(r[idxL.lEnd]);
      if (!rStart || !rEnd) return false;
      return current >= new Date(rStart.getFullYear(), rStart.getMonth(), 1) && current <= new Date(rEnd.getFullYear(), rEnd.getMonth(), 1);
    });
    if (!isCovered) missing.push({ start: new Date(year, month, 1), end: new Date(year, month + 1, 0) });
    current.setMonth(current.getMonth() + 1);
  }
  return missing;
}

function _leCountMonths(s, e) {
  const start = _leParseSafeDate(s); const end = _leParseSafeDate(e);
  if (!start || !end) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function _leFormatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
}