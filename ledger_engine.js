/**
 * ledger_engine.js
 * Motore predittivo del Ledger. Calcola i forecast automatici [CALCULATED] 
 * per i contratti "Minimum Consumption" + "Ledger-Driven".
 * Architettura WYSIWYG + Batch con Core Matematico a fattor comune.
 */

// =========================================================================
// 1. ENDPOINT: MOTORE BATCH GLOBALE (Per ricalcoli notturni / massivi su DB)
// =========================================================================
function regenerateLedgerCalculatedProjections() {
  console.log("LEDGER ENGINE: Avvio rigenerazione proiezioni predittive (Batch Massivo)...");
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName(CONFIG.SHEETS.LEDGER || "Ledger");
  const contractSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS || "Contracts");

  if (!ledgerSheet || !contractSheet) return;

  let ledgerData = ledgerSheet.getDataRange().getValues();
  const contractData = contractSheet.getDataRange().getValues();

  const cHeaders = contractData[0];
  const idxC = {
    cId: cHeaders.indexOf("Contract ID"), 
    cTotal: cHeaders.indexOf("Total Commitment"), cModel: cHeaders.indexOf("Pricing Model"),
    billingTerms: cHeaders.indexOf("Billing Terms"), cStart: cHeaders.indexOf("Start Date"),
    cEnd: cHeaders.indexOf("End Date") !== -1 ? cHeaders.indexOf("End Date") : cHeaders.indexOf("Contract End Date"), cStatus: cHeaders.indexOf("Status")
  };

  const lHeaders = ledgerData[0];
  const idxL = { 
    lId: lHeaders.indexOf("Contract ID"), 
    lStart: lHeaders.indexOf("Start Date"), lEnd: lHeaders.indexOf("End Date"), 
    lAmount: lHeaders.indexOf("Amount"), lType: lHeaders.indexOf("Type") 
  };

  // Purge massivo preventivo
  for (let i = ledgerData.length - 1; i > 0; i--) {
    if (String(ledgerData[i][idxL.lType]).trim().toUpperCase() === "CALCULATED") {
      ledgerSheet.deleteRow(i + 1);
    }
  }

  const cleanLedgerData = ledgerSheet.getDataRange().getValues();
  const allNewRows = [];

  for (let i = 1; i < contractData.length; i++) {
    const row = contractData[i];
    if (String(row[idxC.cStatus]).trim().toUpperCase() !== "ACTIVE") continue;

    const cId = String(row[idxC.cId]).trim();
    const model = String(row[idxC.cModel]).trim();
    const terms = String(row[idxC.billingTerms]).trim();
    
    // 🟢 UPDATED GATEWAY: Allows both Minimum and Capped Consumption models if they are Ledger-Driven
    if (!cId || !["Minimum Consumption", "Capped Consumption"].includes(model) || terms !== "Ledger-Driven") continue; 

    // Adapter converte la riga dello sheet nel formato standard e chiama il CORE
    const newRows = _leAdapterSheetToCore(cId, row, cleanLedgerData, idxC, idxL);
    if (newRows.length > 0) allNewRows.push(...newRows);
  }

  if (allNewRows.length > 0) {
    ledgerSheet.getRange(ledgerSheet.getLastRow() + 1, 1, allNewRows.length, allNewRows[0].length).setValues(allNewRows);
    console.log(`LEDGER ENGINE: Generate con successo ${allNewRows.length} righe predittive.`);
  }
}

// =========================================================================
// 2. ENDPOINT: PREVIEW WYSIWYG (Da interfaccia, senza toccare DB)
// =========================================================================
function _lePreviewLedgerAutoForecast(contractData, ledgerData) {
  const contractStart = _leParseSafeDate(contractData["Start Date"]);
  const contractEnd = _leParseSafeDate(contractData["Contract End Date"]);
  const totalCommitment = parseFloat(contractData["Total Commitment"]) || 0;

  if (!contractStart || !contractEnd) throw new Error("Valid Start Date and End Date are required.");

  // Adapter converte i JSON della UI nel formato standard 
  const actuals = (ledgerData || [])
    .filter(r => {
        const t = String(r["Type"]).trim().toUpperCase();
        return t === "ACTUAL" || t === "FORECAST";
    })
    .map(r => ({
      start: _leParseSafeDate(r["Start Date"]),
      end: _leParseSafeDate(r["End Date"]),
      amount: parseFloat(r["Amount"]) || 0
    }))
    .filter(a => a.start && a.end);

  // CHIAMATA AL CORE MATEMATICO
  const results = _leCalculateCoreMath(contractStart, contractEnd, totalCommitment, actuals);

  // Mappa il risultato nel JSON richiesto dall'interfaccia UI
  return results.map(res => ({
    "Type": "CALCULATED",
    "Start Date": _leFormatDate(res.start),
    "End Date": _leFormatDate(res.end),
    "Amount": res.amount,
    "Notes": "Engine-generated forecast"
  }));
}

// =========================================================================
// 3. ADAPTERS (Ponti verso il Core Matematico)
// =========================================================================
function _leAdapterSheetToCore(contractId, contractRow, cleanLedgerData, idxC, idxL) {
  const contractStart = _leParseSafeDate(contractRow[idxC.cStart]);
  const contractEnd = _leParseSafeDate(contractRow[idxC.cEnd]);
  const totalCommitment = parseFloat(String(contractRow[idxC.cTotal]).replace(/[^0-9.-]+/g, "")) || 0;

  if (!contractStart || !contractEnd) return [];

  const existing = cleanLedgerData.filter(r => String(r[idxL.lId]).trim() === contractId);
  const actuals = existing
    .filter(r => String(r[idxL.lType]).trim().toUpperCase() === "ACTUAL")
    .map(r => ({
      start: _leParseSafeDate(r[idxL.lStart]),
      end: _leParseSafeDate(r[idxL.lEnd]),
      amount: parseFloat(String(r[idxL.lAmount]).replace(/[^0-9.-]+/g, "")) || 0
    }))
    .filter(a => a.start && a.end);

  // CHIAMATA AL CORE MATEMATICO
  const results = _leCalculateCoreMath(contractStart, contractEnd, totalCommitment, actuals);

  // Mappa il risultato nell'array 2D richiesto da Google Sheets
  return results.map(res => [
    contractId, 
    _leFormatDate(res.start), 
    _leFormatDate(res.end), 
    "CALCULATED", 
    res.amount, 
    "Engine-generated forecast"
  ]);
}

// =========================================================================
// 4. IL CORE MATEMATICO (Unico, Isolato, Agnostico e a Fattor Comune)
// =========================================================================
function _leCalculateCoreMath(contractStart, contractEnd, totalCommitment, actuals) {
  const missingMonths = [];
  let current = new Date(contractStart.getFullYear(), contractStart.getMonth(), 1);
  
  // A. Trova i mesi scoperti (gap analysis)
  while (current <= contractEnd) {
    const month = current.getMonth(); 
    const year = current.getFullYear();
    const currentMonthStart = new Date(year, month, 1);
    
    const isCovered = actuals.some(r => {
      return currentMonthStart >= new Date(r.start.getFullYear(), r.start.getMonth(), 1) && 
             currentMonthStart <= new Date(r.end.getFullYear(), r.end.getMonth(), 1);
    });
    
    if (!isCovered) {
      missingMonths.push({ start: new Date(year, month, 1), end: new Date(year, month + 1, 0) });
    }
    current.setMonth(current.getMonth() + 1);
  }

  if (missingMonths.length === 0) return []; // Cassa già completamente coperta

  // B. Calcola le metriche di consumo
  let totalActualMonths = 0;
  let totalActualAmount = 0;

  actuals.forEach(r => {
    totalActualMonths += (r.end.getFullYear() - r.start.getFullYear()) * 12 + (r.end.getMonth() - r.start.getMonth()) + 1;
    totalActualAmount += r.amount;
  });

  const avgMonthlyRate = totalActualMonths > 0 ? (totalActualAmount / totalActualMonths) : 0;
  const remainingBudget = Math.max(0, totalCommitment - totalActualAmount);

  const contractTotalMonths = (contractEnd.getFullYear() - contractStart.getFullYear()) * 12 + (contractEnd.getMonth() - contractStart.getMonth()) + 1;
  const defaultMonthlyRate = contractTotalMonths > 0 ? (totalCommitment / contractTotalMonths) : 0;
  
  const currentAvgRate = totalActualMonths > 0 ? avgMonthlyRate : defaultMonthlyRate;
  const projectedTotalAtEnd = totalActualAmount + (missingMonths.length * currentAvgRate);

  // C. Stabilisce il rateo finale applicando il tetto del commitment
  let finalMonthlyRate = (projectedTotalAtEnd > totalCommitment) 
      ? currentAvgRate 
      : (missingMonths.length > 0 ? (remainingBudget / missingMonths.length) : 0);
      
  const finalMonthlyRateRounded = Math.round(finalMonthlyRate * 100) / 100;

  // D. Restituisce un JSON puro con i risultati
  return missingMonths.map(m => ({
    start: m.start,
    end: m.end,
    amount: finalMonthlyRateRounded
  }));
}

// =========================================================================
// 5. HELPER PRIVATI DI UTILITÀ (Parsing e Formattazione Date)
// =========================================================================
function _leParseSafeDate(d) {
  if (!d) return null; 
  if (d instanceof Date) return !isNaN(d.getTime()) ? d : null;
  const s = String(d).trim(); if (!s) return null;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
    const p = s.split(/[\/\-]/); return new Date(parseInt(p[2],10), parseInt(p[1],10)-1, parseInt(p[0],10));
  }
  const prs = new Date(s); return !isNaN(prs.getTime()) ? prs : null;
}

function _leFormatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}