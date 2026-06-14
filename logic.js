/**
 * Logica di Business per il calcolo dei parametri contrattuali.
 * Trasforma i dati grezzi in dati elaborati (Annual Value, Status, ecc.) senza scrivere sul foglio.
 * @param {Object} item - Oggetto contenente i dati del contratto grezzi dal frontend.
 * @returns {Object} - Oggetto con i campi calcolati (AnnualValue, ContractTerm, Status, ecc.).
 */
function calculateContractLogic(item) {
    const d = {};

    // 1. NORMALIZZAZIONE: Mappa le chiavi del foglio (item) in variabili interne (d)
    for (let header in CONTRACT_FIELD_MAP) {
        d[CONTRACT_FIELD_MAP[header]] = item[header];
    }
    // Manteniamo lo status attuale se presente, altrimenti stringa vuota
    d.status = item["Status"] || "";

    // Funzione helper sicura per il parsing delle date
    const parse = (dateStr) => (dateStr && dateStr !== "") ? new Date(dateStr) : null;

    // Funzione helper sicura per formattare le date per il foglio (evita TypeError)
    const formatDate = (val) => {
        if (val instanceof Date && !isNaN(val)) return val.toISOString().split('T')[0];
        if (typeof val === 'string' && val.length > 0) return val;
        return "";
    };

    // 2. CALCOLI INTERNI
    const startDate = parse(d.startDate);
    const contractEnd = parse(d.contractEndDate);
    const adjustedEnd = parse(d.adjustedEndDate);
    const totComm = parseFloat(d.totalCommitment) || 0;

    // LOGICA END DATE: Formula =IF(ISBLANK(adj), end, adj)
    // Se adjustedEnd è nullo/invalido, usa contractEnd
    d.endDate = (adjustedEnd && !isNaN(adjustedEnd.getTime())) ? adjustedEnd : contractEnd;

    // Calcolo Term (Mesi) basato sulla End Date calcolata
    if (startDate && d.endDate) {
        // Trucco contabile: aggiungiamo 1 giorno alla data di fine per rendere il calcolo inclusivo
        const endPlusOne = new Date(d.endDate);
        endPlusOne.setDate(endPlusOne.getDate() + 1);

        d.contractTerm = (endPlusOne.getFullYear() - startDate.getFullYear()) * 12 + (endPlusOne.getMonth() - startDate.getMonth());
    } else {
        d.contractTerm = 0;
    }

    // Calcoli Finanziari
    const diffDays = (start, end) => {
        if (!start || !end) return 0;
        return Math.round((parse(end) - parse(start)) / (1000 * 60 * 60 * 24)) + 1;
    };

    const origTermDays = diffDays(startDate, contractEnd);
    const actTermDays = diffDays(startDate, d.endDate);

    if (d.costRecurrence === "One-Shot") {
        d.effectiveCommitment = totComm;
        d.annualValue = parseFloat(totComm.toFixed(2));
    } else {
        d.effectiveCommitment = parseFloat((totComm * (actTermDays / (origTermDays || 1))).toFixed(2));
        const origTerm = Math.max(1, origTermDays);
        d.annualValue = parseFloat(((totComm / origTerm) * 365).toFixed(2));
    }

    // Calcolo Status
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!startDate) d.status = "";
    else if (d.endDate < today) d.status = "EXPIRED";
    else if (startDate > today) d.status = "UPCOMING";
    else d.status = "ACTIVE";

    // 3. COSTRUZIONE RESULT (Ritorno rigoroso al formato foglio)
    const result = {};

    // Iteriamo sul mapping per ricostruire l'oggetto da scrivere nel foglio
    for (let header in CONTRACT_FIELD_MAP) {
        const key = CONTRACT_FIELD_MAP[header];
        const val = d[key];

        // Se è una data, la formattiamo con sicurezza
        if (['endDate', 'startDate', 'contractEndDate', 'adjustedEndDate'].includes(key)) {
            result[header] = formatDate(val);
        } else {
            // Per gli altri campi, prendiamo il valore o stringa vuota
            result[header] = (val !== undefined && val !== null) ? val : "";
        }
    }

    // Sovrascriviamo con i campi calcolati (per sicurezza)
    result["Status"] = d.status;
    result["Annual Value"] = d.annualValue;
    result["Effective Commitment"] = d.effectiveCommitment;
    result["Contract Term (Months)"] = d.contractTerm;

    return result;
}

/**
 * Pipeline in-memory aggiornata per il ricalcolo del Master Contract.
 * Risolve il problema del mismatch delle chiavi adattando il payload camelCase
 * al formato atteso dalle regole di business e intercettando il return puro.
 * @param {Object} payload - Payload completo inviato dal client.
 * @return {Object} Oggetto payload arricchito con i KPI calcolati.
 */
function calculateMasterMetricsInMemory(payload) {
    const details = payload.details || [];
    const initiatives = payload.initiatives || [];
    const suppliers = payload.suppliers || [];
    const masterId = payload.masterId || "";
    const supplierName = payload.supplier || "";

    // ==========================================
    // FASE 1: CALCOLO DEI SINGOLI CONTRATTI (Con adattamento chiavi)
    // ==========================================
    details.forEach(detailRow => {
        // NUOVO: Iniettiamo l'ereditarietà dal Master prima di convertire l'oggetto
        detailRow.assetName = payload.assetName || "";
        detailRow.supplier = payload.supplier || "";

        // 1a. Convertiamo da camelCase a Intestazioni del Foglio per darlo in pasto alla logica nativa
        const itemHeaderObj = {};
        for (let header in CONTRACT_FIELD_MAP) {
            const frontendKey = CONTRACT_FIELD_MAP[header];
            if (detailRow[frontendKey] !== undefined) {
                itemHeaderObj[header] = detailRow[frontendKey];
            }
        }

        // Garantiamo il passaggio dello status se presente
        itemHeaderObj["Status"] = detailRow.status || "";

        // 1b. Eseguiamo il calcolo nativo e intercettiamo il NUOVO oggetto restituito
        const calculatedHeaderObj = calculateContractLogic(itemHeaderObj);

        // 1c. Ri-mappiamo i campi calcolati dentro l'oggetto camelCase originale (detailRow)
        // Questo permette a syncDetailTable e a updateRowSafe di trovarli durante la scrittura
        detailRow.effectiveCommitment = calculatedHeaderObj["Effective Commitment"];
        detailRow.annualValue = calculatedHeaderObj["Annual Value"];
        detailRow.status = calculatedHeaderObj["Status"];
        detailRow.contractTerm = calculatedHeaderObj["Contract Term (Months)"];
        detailRow.endDate = calculatedHeaderObj["End Date"];
    });

    // ==========================================
    // FASE 2: AGGREGAZIONI FINOPS SUL MASTER
    // ==========================================
    let minStartDate = null;
    let maxEndDate = null;
    let totalEffectiveCommitment = 0;
    let recurrentEffectiveCommitment = 0; // CORREZIONE: Cambiato da nominale a effettivo
    let hasActiveContracts = false;

    details.forEach(c => {
        if (c.startDate) {
            const sDate = new Date(c.startDate);
            if (!isNaN(sDate.getTime()) && (!minStartDate || sDate < minStartDate)) {
                minStartDate = sDate;
            }
        }

        if (c.endDate) {
            const eDate = new Date(c.endDate);
            if (!isNaN(eDate.getTime()) && (!maxEndDate || eDate > maxEndDate)) {
                maxEndDate = eDate;
            }
        }

        totalEffectiveCommitment += parseFloat(c.effectiveCommitment) || 0;

        // Accumuliamo l'effectiveCommitment (già scalato su adjusted date)
        if (String(c.costRecurrence).trim().toLowerCase() === "recurrent") {
            recurrentEffectiveCommitment += parseFloat(c.effectiveCommitment) || 0;
        }

        if (String(c.status).trim().toUpperCase() === "ACTIVE") {
            hasActiveContracts = true;
        }
    });

    const computedMasterStartDateStr = minStartDate ? minStartDate.toISOString().split('T')[0] : "";
    const computedMasterEndDateStr = maxEndDate ? maxEndDate.toISOString().split('T')[0] : "";

    // 2. Contract Term (Months)
    let computedContractTerm = 0;
    if (computedMasterStartDateStr && computedMasterEndDateStr) {
        const sDate = new Date(computedMasterStartDateStr);
        const eDate = new Date(computedMasterEndDateStr);
        const endPlusOne = new Date(eDate);
        endPlusOne.setDate(endPlusOne.getDate() + 1);

        computedContractTerm = (endPlusOne.getFullYear() - sDate.getFullYear()) * 12 + (endPlusOne.getMonth() - sDate.getMonth());
        if (computedContractTerm < 0) computedContractTerm = 0;
    }

    // 3. Run Rate del Master basato sull'Effective Commitment reale
    let computedRunRate = 0;
    if (recurrentEffectiveCommitment > 0 && computedContractTerm > 0) {
        // Calcolo pulito: riflette il burn rate reale spalmato sulla durata effettiva
        computedRunRate = parseFloat(((recurrentEffectiveCommitment / computedContractTerm) * 12).toFixed(2));
    }

    // 4. Billing Channel (Lookup in memoria sull'array filtrato spedito dal client)
    let computedBillingChannel = "";
    const supplierMatch = suppliers.find(s => String(s["Supplier"]).trim().toLowerCase() === String(supplierName).trim().toLowerCase());
    if (supplierMatch) {
        computedBillingChannel = supplierMatch["Type"] || "";
    }

    // 5. Status del Master (Incrocio logico Initiatives del Master + Righe Dettaglio Attive)
    let checkTerminated = 0;
    let checkNeg = 0;

    // Il controllo gira SOLO se il master ha un ID reale, evitando falsi positivi su stringhe vuote
    if (masterId && masterId.trim() !== "") {
        initiatives.forEach(init => {
            if (String(init["Master Contract ID"]).trim() === String(masterId).trim()) {
                const initStatus = String(init["Initiative Status"]).trim().toUpperCase();
                const decision = String(init["Decision"]).trim().toUpperCase();

                if (initStatus === "COMPLETED" && ["TERMINATE", "REPLACE", "TRANSFER"].includes(decision)) {
                    checkTerminated++;
                }
                if (initStatus === "IN PROGRESS") {
                    checkNeg++;
                }
            }
        });
    }

    let computedStatus = "EXPIRED";
    if (checkTerminated > 0) computedStatus = "TERMINATED";
    else if (hasActiveContracts) computedStatus = "ACTIVE";
    else if (checkNeg > 0) computedStatus = "IN NEGOTIATION";

    // Mappiamo i risultati finali calcolati sulle chiavi attese da data.gs / MASTER_FIELD_MAP
    payload.status = computedStatus;
    payload.masterStartDate = computedMasterStartDateStr;
    payload.masterEndDate = computedMasterEndDateStr;
    payload.contractTerm = computedContractTerm;
    payload.totalCommitment = parseFloat(totalEffectiveCommitment.toFixed(2));
    payload.runRate = computedRunRate;
    payload.billingChannel = computedBillingChannel;

    console.log("CALCOLI MASTER EFFETTUATI CON SUCCESSO: " + JSON.stringify(payload));
    return payload;
}

/**
 * Genera un ID contratto univoco basato sulla logica aziendale.
 * @param {Object} detail - Il dettaglio del contratto corrente.
 * @param {Object} payload - Dati del Master associato.
 * @param {Object} counts - Mappa dei contatori correnti per fornitore.
 * @returns {string} - ID contratto formattato (es. CTR-SUPPL-ASSET-YYYY-01).
 */
function generateContractId(detail, payload, counts) {
    let targetSupplier = (payload.supplier || "GENERIC");
    let sLower = targetSupplier.trim().toLowerCase();

    counts[sLower] = (counts[sLower] || 0) + 1;
    let formattedCounter = counts[sLower] < 10 ? "0" + counts[sLower] : counts[sLower].toString();

    let cleanSupplier = targetSupplier.replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 5);
    let cleanAsset = (payload.assetName || "ASST").replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 4);

    let year = detail.startDate ? detail.startDate.split("-")[0] : "YYYY";

    return "CTR-" + cleanSupplier + "-" + cleanAsset + "-" + year + "-" + formattedCounter;
}

/**
 * Genera l'ID del Master Contract.
 * @param {Object} payload - Dati del master.
 * @param {Array} allMasters - Array di tutti i master esistenti per contare le occorrenze.
 * @returns {string} - ID master formattato (es. MCT-SUPPL-ASSET-YYYY-01).
 */
function generateMasterId(payload, allMasters) {
    // 1. Contatore: Quanti master ha già questo fornitore?
    const supplierCount = allMasters.filter(m =>
        (m["Supplier"] || "").toString().trim().toLowerCase() === payload.supplier.trim().toLowerCase()
    ).length + 1;

    const formattedCounter = supplierCount < 10 ? "0" + supplierCount : supplierCount.toString();

    // 2. Pulizia Supplier (regex replace, uppercase, max 5 char)
    const cleanSupplier = payload.supplier.replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 5);

    // 3. Pulizia Asset Name (regex replace, uppercase, max 4 char)
    const cleanAsset = (payload.assetName || "ASST").replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 4);

    // 4. Anno (estratto dalla data calcolata, se assente usa l'anno corrente)
    let year = "YYYY";
    const dateSource = payload.masterStartDate || payload.startDate;

    if (dateSource && dateSource.trim() !== "") {
        year = dateSource.split("-")[0];
    } else {
        // Fallback automatico sull'anno corrente (2026) se non ci sono contratti sotto
        year = new Date().getFullYear().toString();
    }

    return "MCT-" + cleanSupplier + "-" + cleanAsset + "-" + year + "-" + formattedCounter;
}