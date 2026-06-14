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
    const today = new Date(); today.setHours(0,0,0,0);
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
    
    // 4. Anno (estratto dalla data, se presente nel payload)
    let year = "YYYY";
    if (payload.startDate) { // Assicurati di passare startDate dal frontend
        year = payload.startDate.split("-")[0];
    }

    return "MCT-" + cleanSupplier + "-" + cleanAsset + "-" + year + "-" + formattedCounter;
}