/**
 * projections_engine.js
 * Motore analitico per l'elaborazione parallela e multianno dei modelli finanziari.
 * Calcola simultaneamente FY26, FY27 e FY28 per le colonne ufficiali Baseline e Optimized.
 */

const PROJECTIONS_CONFIG = {
    FISCAL_YEARS: {
        FY26: { baselineLabel: "FY26 Baseline", optimizedLabel: "FY26 Optimized", start: new Date(2025, 6, 1), end: new Date(2026, 5, 30) },
        FY27: { baselineLabel: "FY27 Baseline", optimizedLabel: "FY27 Optimized", start: new Date(2026, 6, 1), end: new Date(2027, 5, 30) },
        FY28: { baselineLabel: "FY28 Baseline", optimizedLabel: "FY28 Optimized", start: new Date(2027, 6, 1), end: new Date(2028, 5, 30) }
    }
};

function updateAllOfficialFiscalProjections() {
    console.log("PROJEZIONI: Avvio ricalcolo parallelo con supporto multi-iniziativa (FY26-FY28)...");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const projectionsSheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTIONS || "FiscalProjections");
    const contractSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS || "Contracts");
    const ledgerSheet = ss.getSheetByName("Ledger");
    const initiativesSheet = ss.getSheetByName(CONFIG.SHEETS.INITIATIVES || "Initiatives");

    if (!projectionsSheet || !contractSheet || !ledgerSheet || !initiativesSheet) {
        console.error("PROJEZIONI ERRORE: Struttura fogli incompleta.");
        return;
    }

    const projectionsData = projectionsSheet.getDataRange().getValues();
    const contractData = contractSheet.getDataRange().getValues();
    const ledgerData = ledgerSheet.getDataRange().getValues();
    const initiativesData = initiativesSheet.getDataRange().getValues();

    const fpHeaders = projectionsData[0];
    const idxFP = { contractId: fpHeaders.indexOf("Contract ID") };

    const years = ["FY26", "FY27", "FY28"];
    const types = ["Baseline", "Optimized"];
    const colIndices = {};

    // Mappatura dinamica o creazione oneshot delle colonne di report ufficiali
    years.forEach(year => {
        types.forEach(type => {
            const label = (type === "Baseline") ? PROJECTIONS_CONFIG.FISCAL_YEARS[year].baselineLabel : PROJECTIONS_CONFIG.FISCAL_YEARS[year].optimizedLabel;
            let colIdx = fpHeaders.indexOf(label);
            if (colIdx === -1) {
                colIdx = fpHeaders.length;
                fpHeaders.push(label);
                projectionsSheet.getRange(1, colIdx + 1).setValue(label);
            }
            colIndices[year + "_" + type] = colIdx;
        });
    });

    // --- COSTRUZIONE MAPPE IN-MEMORY AD ALTA VELOCITÀ ---
    const contractsMap = _peBuildContractsMap(contractData);
    const ledgerMap = _peBuildLedgerMap(ledgerData);
    const initMap = _peBuildInitiativesMap(initiativesData); // Supporta array multi-iniziativa!
    const contractParentMap = _peBuildContractParentMap(contractData);
    const groupTotalValueMap = _peBuildGroupTotalValueMap(contractData);

    const outputs = {};
    years.forEach(year => {
        types.forEach(type => { outputs[year + "_" + type] = []; });
    });

    // --- LOOP CENTRALIZZATO SULLE RIGHE DI PROIEZIONE ---
    for (let i = 1; i < projectionsData.length; i++) {
        const contractIdRef = String(projectionsData[i][idxFP.contractId]).trim();
        const contract = contractsMap[contractIdRef];

        if (!contract || !contract.gid || !contract.start) {
            years.forEach(year => { types.forEach(type => outputs[year + "_" + type].push([0])); });
            continue;
        }

        const chainRel = _peTraverseContractChain(contract.gid, contractParentMap, initMap);
        const ledgerRows = ledgerMap[contractIdRef] || [];
        const contractInits = initMap[contract.gid] || [];
        const groupTotalValue = groupTotalValueMap[contract.gid] || 0;
        const contractWeight = groupTotalValue > 0 ? contract.annVal / groupTotalValue : 0;

        // RISOLUZIONE CRITICA MULTI-INIZIATIVA (Risolve la rinegoziazione + termination simultanee)
        const optInit = contractInits.find(ini => ["OPTIMIZATION", "OPTIMIZE"].includes(ini.decision));
        const termInit = contractInits.find(ini => ["TERMINATION", "TERMINATE", "REPLACE", "TRANSFER"].includes(ini.decision));

        const resolvedInits = {
            optTargetDate: optInit ? optInit.targetDate : new Date(2099, 11, 31),
            allocatedSaving: optInit ? (optInit.targetSaving * contractWeight) : 0,
            termInit: termInit || null
        };

        years.forEach(year => {
            const fyConfig = PROJECTIONS_CONFIG.FISCAL_YEARS[year];

            // Calcolo Baseline
            outputs[year + "_Baseline"].push([_peCalculateCore(contract, ledgerRows, chainRel.minTd, chainRel.isChainTransferred, fyConfig, false, resolvedInits)]);

            // Calcolo Optimized con sbarramento dismissioni e scomposizione tariffe
            outputs[year + "_Optimized"].push([_peCalculateCore(contract, ledgerRows, chainRel.minTd, chainRel.isChainTransferred, fyConfig, true, resolvedInits)]);
        });
    }

    // --- SCRITTURA BATCH FINALE ---
    years.forEach(year => {
        types.forEach(type => {
            const key = year + "_" + type;
            projectionsSheet.getRange(2, colIndices[key] + 1, outputs[key].length, 1).setValues(outputs[key]);
        });
    });
    console.log("PROJEZIONI: Ricalcolo parallelo ufficiale completato.");
}

/**
 * CORE LOGICO MATEMATICO: Ripartisce i costi differenziando Linear, Ledger-Driven e Full Upfront.
 */
function _peCalculateCore(contract, ledgerRows, chainTransferDate, isChainTransferred, fyConfig, isOptimized, resolvedInits) {
  const FY_S = fyConfig.start;
  const FY_E = fyConfig.end;

  let effectiveE;
  let baseEnd = contract.end || new Date(2099, 11, 31);

  if (isOptimized) {
    const regEnd = (contract.status === "EXPIRED" || contract.recurrence === "One-Shot" || isChainTransferred) ? 
                   baseEnd : new Date(Math.max(baseEnd.getTime(), FY_E.getTime()));
    
    let absoluteCap = new Date(2099, 11, 31);
    if (isChainTransferred && chainTransferDate < absoluteCap) absoluteCap = chainTransferDate;
    if (resolvedInits.termInit && resolvedInits.termInit.targetDate < absoluteCap) absoluteCap = resolvedInits.termInit.targetDate;
    
    effectiveE = new Date(Math.min(regEnd.getTime(), absoluteCap.getTime()));
  } else {
    const isPastTransfer = isChainTransferred && chainTransferDate < FY_S;
    baseEnd = isPastTransfer ? chainTransferDate : baseEnd;
    effectiveE = (contract.status === "EXPIRED" || contract.recurrence === "One-Shot" || isChainTransferred) ? baseEnd : new Date(Math.max(baseEnd.getTime(), FY_E.getTime()));
  }

  // --- STRADA A: NUOVA LOGICA FULL UPFRONT (100% SULLA START DATE) ---
  if (contract.billingTerms === "Full Upfront") {
    let upfrontSum = 0;
    
    // Il 100% del Commitment cade nel mese di partenza (Start Date) del contratto
    if (contract.start && contract.start >= FY_S && contract.start <= FY_E) {
      if (!isOptimized) {
        upfrontSum = contract.totComm;
      } else {
        // Se l'asset viene dismesso (Transfer/Termination) prima dello start, la spesa si azzera
        if (contract.start > effectiveE) {
          upfrontSum = 0;
        } else {
          // Se l'ottimizzazione tariffaria è attiva prima o il giorno stesso dello start, l'upfront nasce ridotto
          if (contract.start >= resolvedInits.optTargetDate) {
            upfrontSum = contract.totComm * ((contract.annVal - resolvedInits.allocatedSaving) / (contract.annVal || 1));
          } else {
            upfrontSum = contract.totComm;
          }
        }
      }
    }

    // Se il contratto scade ed è RECURRENT, aggiunge il Run Rate virtuale di rinnovo per i mesi successivi alla scadenza
    let virtualSum = 0;
    const contractEndDateCheck = contract.end || new Date(2099, 11, 31);
    
    if (contract.recurrence !== "One-Shot" && contractEndDateCheck < FY_E) {
      const virtualS = new Date(Math.max(FY_S.getTime(), contractEndDateCheck.getTime() + 86400000));
      const capEnd = isOptimized ? Math.min(FY_E.getTime(), effectiveE.getTime()) : FY_E.getTime();
      const virtualE = new Date(capEnd);
      
      if (virtualS <= virtualE) {
        const virtualDays = Math.floor((virtualE - virtualS) / 86400000) + 1;
        
        if (!isOptimized) {
          virtualSum = (contract.annVal / 365) * virtualDays;
        } else {
          let vDaysPre = 0, vDaysPost = 0;
          if (virtualS < resolvedInits.optTargetDate) {
            vDaysPre = Math.floor((new Date(Math.min(virtualE.getTime(), resolvedInits.optTargetDate.getTime() - 86400000)) - virtualS) / 86400000) + 1;
          }
          if (virtualE >= resolvedInits.optTargetDate) {
            vDaysPost = Math.floor((virtualE.getTime() - Math.max(virtualS.getTime(), resolvedInits.optTargetDate.getTime())) / 86400000) + 1;
          }
          const dailyBaseline = contract.annVal / 365;
          const dailyOpt = (contract.annVal - resolvedInits.allocatedSaving) / 365;
          virtualSum = (dailyBaseline * vDaysPre) + (dailyOpt * vDaysPost);
        }
      }
    }
    return Math.round((upfrontSum + virtualSum) * 100) / 100;
  }

  // --- STRADA B: CALCOLO BASATO SU LEDGER (MANUALI O CONSUMI RIGIDI) ---
  const useLedger = (contract.model === "Pure Consumption" || contract.model === "Minimum Consumption" || contract.billingTerms === "Ledger-Driven");
  if (useLedger && ledgerRows.length > 0) {
    let ledgerSum = 0;
    ledgerRows.forEach(item => {
      if (item.start && item.end && item.start <= FY_E && item.end >= FY_S) {
        const overlapS = new Date(Math.max(FY_S.getTime(), item.start.getTime()));
        const capEnd = isOptimized ? Math.min(FY_E.getTime(), effectiveE.getTime()) : FY_E.getTime();
        const overlapE = new Date(Math.min(capEnd, item.end.getTime()));
        
        if (overlapS <= overlapE) {
          const overlapDays = Math.floor((overlapE - overlapS) / 86400000) + 1;
          const rowTotalDays = Math.max(1, Math.floor((item.end - item.start) / 86400000) + 1);
          
          if (!isOptimized) {
            ledgerSum += item.amount * (overlapDays / rowTotalDays);
          } else {
            let rDaysPre = 0, rDaysPost = 0;
            if (overlapS < resolvedInits.optTargetDate) {
              rDaysPre = Math.floor((new Date(Math.min(overlapE.getTime(), resolvedInits.optTargetDate.getTime() - 86400000)) - overlapS) / 86400000) + 1;
            }
            if (overlapE >= resolvedInits.optTargetDate) {
              rDaysPost = Math.floor((overlapE.getTime() - Math.max(overlapS.getTime(), resolvedInits.optTargetDate.getTime())) / 86400000) + 1;
            }
            const dailyRatePre = item.amount / rowTotalDays;
            const dailyRatePost = contract.annVal > 0 ? dailyRatePre * ((contract.annVal - resolvedInits.allocatedSaving) / contract.annVal) : dailyRatePre;
            ledgerSum += (dailyRatePre * rDaysPre) + (dailyRatePost * rDaysPost);
          }
        }
      }
    });

    let virtualSum = 0;
    const contractEndDateCheck = contract.end || new Date(2099, 11, 31);
    if (contract.recurrence !== "One-Shot" && contractEndDateCheck < FY_E) {
      const virtualS = new Date(Math.max(FY_S.getTime(), contractEndDateCheck.getTime() + 86400000));
      const capEnd = isOptimized ? Math.min(FY_E.getTime(), effectiveE.getTime()) : FY_E.getTime();
      const virtualE = new Date(capEnd);
      
      if (virtualS <= virtualE) {
        const virtualDays = Math.floor((virtualE - virtualS) / 86400000) + 1;
        if (!isOptimized) {
          virtualSum = (contract.annVal / 365) * virtualDays;
        } else {
          let vDaysPre = 0, vDaysPost = 0;
          if (virtualS < resolvedInits.optTargetDate) {
            vDaysPre = Math.floor((new Date(Math.min(virtualE.getTime(), resolvedInits.optTargetDate.getTime() - 86400000)) - virtualS) / 86400000) + 1;
          }
          if (virtualE >= resolvedInits.optTargetDate) {
            vDaysPost = Math.floor((virtualE.getTime() - Math.max(virtualS.getTime(), resolvedInits.optTargetDate.getTime())) / 86400000) + 1;
          }
          const dailyBaseline = contract.annVal / 365;
          const dailyOpt = (contract.annVal - resolvedInits.allocatedSaving) / 365;
          virtualSum = (dailyBaseline * vDaysPre) + (dailyOpt * vDaysPost);
        }
      }
    }
    return Math.round((ledgerSum + virtualSum) * 100) / 100;
  } 
  
  // --- STRADA C: CALCOLO LINEARE STANDARD ---
  const actualS = new Date(Math.max(FY_S.getTime(), contract.start.getTime()));
  const actualE = new Date(Math.min(FY_E.getTime(), effectiveE.getTime()));
  const daysInFY = Math.max(0, Math.floor((actualE - actualS) / 86400000) + 1);
  const totalDays = Math.max(1, Math.floor(((contract.end || new Date(2099, 11, 31)) - contract.start) / 86400000) + 1);

  if (daysInFY === 0) return 0;

  if (contract.recurrence === "One-Shot") {
    return Math.round(((contract.annVal / totalDays) * daysInFY) * 100) / 100;
  } else {
    if (!isOptimized) {
      return Math.round(((contract.annVal / 365) * daysInFY) * 100) / 100;
    } else {
      const dailyBaseline = contract.annVal / 365;
      const dailyOpt = (contract.annVal - resolvedInits.allocatedSaving) / 365;
      
      let daysPre = 0, daysPost = 0;
      if (actualS < resolvedInits.optTargetDate) {
        daysPre = Math.max(0, Math.floor((new Date(Math.min(actualE.getTime(), resolvedInits.optTargetDate.getTime() - 86400000)) - actualS) / 86400000) + 1);
      }
      if (actualE >= resolvedInits.optTargetDate) {
        daysPost = Math.max(0, Math.floor((actualE.getTime() - Math.max(actualS.getTime(), resolvedInits.optTargetDate.getTime())) / 86400000) + 1);
      }
      return Math.round(((daysPre * dailyBaseline) + (daysPost * dailyOpt)) * 100) / 100;
    }
  }
}

/**
 * MAPPATURA DIZIONARIO CONTRATTI: Arricchita per estrarre sia Billing Terms che Total Commitment.
 */
function _peBuildContractsMap(data) {
  const cHeaders = data[0];
  const idx = {
    cId: cHeaders.indexOf("Contract ID"), status: cHeaders.indexOf("Status"), gid: cHeaders.indexOf("Group ID"),
    targetGid: cHeaders.indexOf("Target Group ID"), annVal: cHeaders.indexOf("Annual Value"), start: cHeaders.indexOf("Start Date"),
    end: cHeaders.indexOf("End Date") !== -1 ? cHeaders.indexOf("End Date") : cHeaders.indexOf("Contract End Date"),
    recurrence: cHeaders.indexOf("Cost Recurrence"), model: cHeaders.indexOf("Pricing Model"), 
    billingTerms: cHeaders.indexOf("Billing Terms"),
    totComm: cHeaders.indexOf("Total Commitment")
  };
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const cId = String(r[idx.cId]).trim();
    if (!cId) continue;
    map[cId] = {
      status: String(r[idx.status]).trim().toUpperCase(), gid: String(r[idx.gid]).trim(), targetGid: String(r[idx.targetGid]).trim(),
      annVal: parseFloat(String(r[idx.annVal]).replace(/[^0-9.-]+/g, "")) || 0, start: _peParseDate(r[idx.start]),
      end: _peParseDate(r[idx.end]), recurrence: String(r[idx.recurrence]).trim(), model: String(r[idx.model]).trim(), 
      billingTerms: String(r[idx.billingTerms]).trim(),
      totComm: parseFloat(String(r[idx.totComm]).replace(/[^0-9.-]+/g, "")) || 0
    };
  }
  return map;
}

function _peBuildInitiativesMap(d) {
    const c = d[0]; const idx = { cGid: c.indexOf("Contracts Group ID"), decision: c.indexOf("Decision"), tDate: c.indexOf("Target Date"), tSaving: c.indexOf("Target Saving (Annualized)") };
    const m = {}; for (let i = 1; i < d.length; i++) {
        const r = d[i]; const cGid = String(r[idx.cGid]).trim(); if (!cGid) continue;
        if (!m[cGid]) m[cGid] = [];
        m[cGid].push({ decision: String(r[idx.decision]).trim().toUpperCase(), targetDate: _peParseDate(r[idx.tDate]) || new Date(2099, 11, 31), targetSaving: parseFloat(String(r[idx.tSaving]).replace(/[^0-9.-]+/g, "")) || 0 });
    } return m;
}

function _peBuildLedgerMap(d) {
    const c = d[0]; const idx = { cid: c.indexOf("Contract ID"), start: c.indexOf("Start Date"), end: c.indexOf("End Date"), amount: c.indexOf("Amount") };
    const m = {}; for (let i = 1; i < d.length; i++) {
        const r = d[i]; const cid = String(r[idx.cid]).trim(); if (!cid) continue;
        if (!m[cid]) m[cid] = []; m[cid].push({ start: _peParseDate(r[idx.start]), end: _peParseDate(r[idx.end]), amount: parseFloat(String(r[idx.amount]).replace(/[^0-9.-]+/g, "")) || 0 });
    } return m;
}

function _peBuildContractParentMap(d) {
    const idxGid = d[0].indexOf("Group ID"); const idxTarget = d[0].indexOf("Target Group ID");
    const m = {}; for (let i = 1; i < d.length; i++) { const t = String(d[i][idxTarget]).trim(); if (t) m[t] = String(d[i][idxGid]).trim(); } return m;
}

function _peBuildGroupTotalValueMap(d) {
    const idxGid = d[0].indexOf("Group ID"); const idxVal = d[0].indexOf("Annual Value");
    const m = {}; for (let i = 1; i < d.length; i++) { const g = String(d[i][idxGid]).trim(); const v = parseFloat(String(d[i][idxVal]).replace(/[^0-9.-]+/g, "")) || 0; if (g) m[g] = (m[g] || 0) + v; } return m;
}

function _peTraverseContractChain(sGid, pMap, iMap) {
    let curr = sGid; let minTd = new Date(2099, 11, 31); let trans = false;
    for (let s = 0; s < 10; s++) {
        if (!curr) break; let next = pMap[curr] || ""; let list = iMap[curr] || [];
        let tInit = list.find(ini => ini.decision === "TRANSFER");
        if (tInit) { trans = true; if (tInit.targetDate < minTd) minTd = tInit.targetDate; }
        curr = next;
    } return { minTd: minTd, isChainTransferred: trans };
}

function _peParseDate(d) {
    if (!d) return null; if (d instanceof Date) return !isNaN(d.getTime()) ? d : null;
    const s = String(d).trim(); if (!s) return null;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
        const p = s.split(/[\/\-]/); return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    }
    const prs = new Date(s); return !isNaN(prs.getTime()) ? prs : null;
}