/**
 * Logica di Business per il calcolo dei parametri contrattuali.
 * Trasforma i dati grezzi in dati elaborati (Annual Value, Status, ecc.) senza scrivere sul foglio.
 */
function calculateContractLogic(item) {
    const d = {};
    for (let header in CONTRACT_FIELD_MAP) {
        d[CONTRACT_FIELD_MAP[header]] = item[header];
    }
    d.status = item["Status"] || "";

    const parse = (dateStr) => (dateStr && dateStr !== "") ? new Date(dateStr) : null;
    const formatDate = (val) => {
        if (val instanceof Date && !isNaN(val)) return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (typeof val === 'string' && val.length > 0) return val;
        return "";
    };

    const startDate = parse(d.startDate);
    const contractEnd = parse(d.contractEndDate);
    const adjustedEnd = parse(d.adjustedEndDate);
    const totComm = parseFloat(d.totalCommitment) || 0;

    d.endDate = (adjustedEnd && !isNaN(adjustedEnd.getTime())) ? adjustedEnd : contractEnd;

    const diffDays = (start, end) => {
        if (!start || !end) return 0;
        return Math.round((parse(end) - parse(start)) / (1000 * 60 * 60 * 24)) + 1;
    };

    const origTermDays = diffDays(startDate, contractEnd);
    const actTermDays = diffDays(startDate, d.endDate);

    // MOTORE MENSILE: Usa 30.4166 giorni (media di un mese) per vaporizzare i problemi degli anni bisestili
    const origTermMonths = Math.max(1, Math.round(origTermDays / 30.4166));
    d.contractTerm = Math.max(0, Math.round(actTermDays / 30.4166));

    if (d.costRecurrence === "One-Shot") {
        d.effectiveCommitment = totComm;
        d.annualValue = parseFloat(totComm.toFixed(2));
    } else {
        d.effectiveCommitment = parseFloat((totComm * (actTermDays / (origTermDays || 1))).toFixed(2));

        // RUN RATE PERFETTO: es. 1.100.000 / 24 mesi * 12 mesi = 550.000 tondi!
        d.annualValue = parseFloat(((totComm / origTermMonths) * 12).toFixed(2));
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!startDate) d.status = "";
    else if (d.endDate < today) d.status = "EXPIRED";
    else if (startDate > today) d.status = "UPCOMING";
    else d.status = "ACTIVE";

    const result = {};
    for (let header in CONTRACT_FIELD_MAP) {
        const key = CONTRACT_FIELD_MAP[header];
        const val = d[key];
        if (['endDate', 'startDate', 'contractEndDate', 'adjustedEndDate'].includes(key)) {
            result[header] = formatDate(val);
        } else {
            result[header] = (val !== undefined && val !== null) ? val : "";
        }
    }

    result["Status"] = d.status;
    result["Annual Value"] = d.annualValue;
    result["Effective Commitment"] = d.effectiveCommitment;
    result["Contract Term (Months)"] = d.contractTerm;

    return result;
}

/**
 * Pipeline in-memory aggiornata per il ricalcolo del Master Contract.
 */
function calculateMasterMetricsInMemory(payload) {
    const details = payload.details || [];
    const initiatives = payload.initiatives || [];
    const suppliers = payload.suppliers || [];
    const masterId = payload.masterId || "";
    const supplierName = payload.supplier || "";

    let computedBillingChannel = "";
    const supplierMatch = suppliers.find(s => String(s["Supplier"]).trim().toLowerCase() === String(supplierName).trim().toLowerCase());
    if (supplierMatch) {
        computedBillingChannel = supplierMatch["Type"] || "";
    }

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

        if (String(c.costRecurrence).trim().toLowerCase() === "recurrent") {
            recurrentEffectiveCommitment += parseFloat(c.effectiveCommitment) || 0;
        }

        if (String(c.status).trim().toUpperCase() === "ACTIVE") {
            hasActiveContracts = true;
        }
    });

    const computedMasterStartDateStr = minStartDate ? minStartDate.toISOString().split('T')[0] : "";
    const computedMasterEndDateStr = maxEndDate ? maxEndDate.toISOString().split('T')[0] : "";

    let computedContractTerm = 0;
    if (computedMasterStartDateStr && computedMasterEndDateStr) {
        const sDate = new Date(computedMasterStartDateStr);
        const eDate = new Date(computedMasterEndDateStr);
        // Stessa logica super robusta per il Master
        const masterDays = Math.round((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
        computedContractTerm = Math.max(0, Math.round(masterDays / 30.4166));
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
 * Genera un ID contratto univoco.
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
 */
function generateMasterId(payload, allMasters) {
    const supplierCount = allMasters.filter(m =>
        (m["Supplier"] || "").toString().trim().toLowerCase() === payload.supplier.trim().toLowerCase()
    ).length + 1;

    const formattedCounter = supplierCount < 10 ? "0" + supplierCount : supplierCount.toString();
    const cleanSupplier = payload.supplier.replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 5);
    const cleanAsset = (payload.assetName || "ASST").replace(/[aeiou.\s]/gi, "").toUpperCase().substring(0, 4);

    let year = "YYYY";
    const dateSource = payload.masterStartDate || payload.startDate;

    if (dateSource && dateSource.trim() !== "") {
        year = dateSource.split("-")[0];
    } else {
        year = new Date().getFullYear().toString();
    }

    return "MCT-" + cleanSupplier + "-" + cleanAsset + "-" + year + "-" + formattedCounter;
}