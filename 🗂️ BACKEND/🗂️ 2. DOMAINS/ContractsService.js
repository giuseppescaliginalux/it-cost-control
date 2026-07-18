/**
 * ============================================================================
 * APPLICATION SERVICE: ContractsService.js
 * ============================================================================
 * Orchestratore della logica di business.
 */

class ContractService {
  constructor() {
    this.repository = new ContractRepository();
  }

  // Disaccoppia la logica di update della Timeline
  syncTimelineState(dirtyMasters, dirtyContracts) {
    if (dirtyMasters && Array.isArray(dirtyMasters)) {
      dirtyMasters.forEach(m => this.repository.saveMasterRow(m));
    }
    if (dirtyContracts && Array.isArray(dirtyContracts)) {
      dirtyContracts.forEach(c => this.repository.saveContractRow(c));
    }
  }

  generateId(prefix, supplier, assetName, year, count) {
    const cleanSupplier = String(supplier || "GEN").replace(/[aeiou.,\s]/gi, "").substring(0, 4).toUpperCase();
    const cleanAsset = String(assetName || "AST").replace(/[aeiou.,\s]/gi, "").substring(0, 4).toUpperCase();
    const padCount = count < 10 ? "0" + count : count;
    return `${prefix}-${cleanSupplier}-${cleanAsset}-${year}-${padCount}`;
  }

  removeDuplicatesByKey(array, key) {
    const seen = new Set();
    return array.filter(item => {
      const val = String(item[key] || "").trim();
      if (val === "") return true;
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  }

  groupBy(array, possibleKeys) {
    const map = {};
    array.forEach(item => {
      let val = "";
      for (let k of possibleKeys) {
        if (item[k] !== undefined && item[k] !== "") {
          val = String(item[k]).trim();
          break;
        }
      }
      if (val) {
        if (!map[val]) map[val] = [];
        map[val].push(item);
      }
    });
    return map;
  }

  processAndSync(payload) {
    // 1. ACQUISIZIONE IMMAGINE: Caricamento della fotografia globale attuale della RAM cache
    let globalMasters = this.repository.findAllMasters();
    let globalContracts = this.repository.findAllContracts();
    let globalSplits = this.repository.findAllSplits();
    let globalLedger = this.repository.findAllLedger();

    // 2. MANIPOLAZIONE DIFENSIVA: Purga in RAM basata ESCLUSIVAMENTE sul Cestino esplicito inviato dal client
    if (payload.deletedContractIds && Array.isArray(payload.deletedContractIds) && payload.deletedContractIds.length > 0) {
      const contractsToDelete = payload.deletedContractIds.filter(id => id && !String(id).toUpperCase().startsWith("TMP-"));
      if (contractsToDelete.length > 0) {
        globalContracts = globalContracts.filter(c => !contractsToDelete.includes(c.contractId || c.id));
        globalSplits = globalSplits.filter(s => !contractsToDelete.includes(s.contractId));
        globalLedger = globalLedger.filter(l => !contractsToDelete.includes(l.contractId));
      }
    }

    if (payload.deletedMasterIds && Array.isArray(payload.deletedMasterIds) && payload.deletedMasterIds.length > 0) {
      const mastersToDelete = payload.deletedMasterIds.filter(id => id && !String(id).toUpperCase().startsWith("TMP-"));
      if (mastersToDelete.length > 0) {
        globalMasters = globalMasters.filter(m => !mastersToDelete.includes(m.masterId || m.id));
        globalContracts = globalContracts.filter(c => !mastersToDelete.includes(c.masterId));
      }
    }

    // Gestione del segnaposto fittizio: se l'operazione ha azzerato i master dell'asset, esegue il flush in cache ed esce
    if (payload.masterId === "PUDGE_OP") {
      this.repository.overwriteAllMasters(globalMasters);
      this.repository.overwriteAllContracts(globalContracts);
      this.repository.overwriteAllSplits(globalSplits);
      this.repository.overwriteAllLedger(globalLedger);
      return "SUCCESS";
    }

    // 3. COSTRUZIONE E CONIAZIONE ID REALI: Sostituzione dei tag provvisori "TMP-" con chiavi sequenziali ufficiali
    const master = new MasterContract({
      ...payload,
      billingChannel: payload.billingChannel || (payload.details.length > 0 ? payload.details[0].billingChannel : "")
    });

    let globalSupplierCount = globalContracts.filter(c => String(c.supplier).toLowerCase().trim() === String(payload.supplier).toLowerCase().trim()).length;

    payload.details.forEach(dtoDetail => {
      const contract = new Contract(dtoDetail);
      if (dtoDetail.ledger && Array.isArray(dtoDetail.ledger)) {
        dtoDetail.ledger.forEach(l => contract.ledger.push(new LedgerMovement(l)));
      }
      if (dtoDetail.splits && Array.isArray(dtoDetail.splits)) {
        dtoDetail.splits.forEach(s => contract.splits.push(new AllocationSplit(s)));
      }
      contract.validateIntegrity();
      master.addChild(contract);
    });

    if (!master.id || String(master.id).toUpperCase().startsWith("TMP-")) {
      const allMasters = globalMasters;
      const mCount = allMasters.filter(m => String(m.supplier).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
      const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
      master.id = this.generateId("MCT", master.supplier, payload.assetName, mYear, mCount);
    }

    master.childContracts.forEach(c => {
      if (!c.id || String(c.id).toUpperCase().startsWith("TMP-")) {
        globalSupplierCount++;
        const cYear = c.startDate ? c.startDate.getFullYear() : new Date().getFullYear();
        c.id = this.generateId("TXT", master.supplier, payload.assetName, cYear, globalSupplierCount);
        c.splits.forEach(s => s.contractId = c.id);
        c.ledger.forEach(l => l.contractId = c.id);
      }
      c.masterId = master.id;
    });

    const exportedMaster = master.exportToData(payload.initiatives || []);
    const exportedDetails = master.childContracts.map(c => c.exportToData());

    let exportedSplits = [];
    let exportedLedger = [];
    master.childContracts.forEach(c => {
      exportedSplits = exportedSplits.concat(c.splits.map(s => s.exportToData()));
      exportedLedger = exportedLedger.concat(c.exportFullLedger());
    });

    const contractIds = master.childContracts.map(c => c.id);

    // 4. MERGE STRUTTURATO: Aggiornamento dei nodi modificati all'interno della mappa globale in RAM
    globalMasters = globalMasters.filter(m => String(m.masterId || m.id) !== String(master.id));
    globalMasters.push(exportedMaster);

    globalContracts = globalContracts.filter(c => String(c.masterId) !== String(master.id));
    globalContracts = globalContracts.concat(exportedDetails);

    globalSplits = globalSplits.filter(s => !contractIds.includes(s.contractId));
    globalSplits = globalSplits.concat(exportedSplits);

    globalLedger = globalLedger.filter(l => !contractIds.includes(l.contractId));
    globalLedger = globalLedger.concat(exportedLedger);

    // 5. CACHE COMMIT: Allineamento della RAM cache prima del ricalcolo e del commit fisico finale del Gateway
    this.repository.overwriteAllMasters(globalMasters);
    this.repository.overwriteAllContracts(globalContracts);
    this.repository.overwriteAllSplits(globalSplits);
    this.repository.overwriteAllLedger(globalLedger);

    return "SUCCESS";
  }

  forceRecalculateAll() {
    const dtosMasters = this.removeDuplicatesByKey(this.repository.findAllMasters(), "masterId");
    const dtosDetails = this.removeDuplicatesByKey(this.repository.findAllContracts(), "contractId");
    const dtosSplits = this.repository.findAllSplits();
    const dtosLedger = this.repository.findAllLedger();
    const dtosInits = this.repository.findAllInitiativesAsDomain();

    const detailsByMaster = this.groupBy(dtosDetails, ["masterId"]);
    const splitsByContract = this.groupBy(dtosSplits, ["contractId"]);
    const ledgerByContract = this.groupBy(dtosLedger, ["contractId"]);
    const initsByMaster = this.groupBy(dtosInits, ["masterId"]);

    let finalMasters = [];
    let finalDetails = [];
    let finalSplits = [];
    let finalLedger = [];

    let globalSupplierCount = dtosDetails.length;

    dtosMasters.forEach(dtoMaster => {
      const mId = dtoMaster.masterId;
      const detailsForMaster = detailsByMaster[mId] || [];
      const masterInits = initsByMaster[mId] || [];

      const master = new MasterContract({
        ...dtoMaster,
        billingChannel: dtoMaster.billingChannel || (detailsForMaster.length > 0 ? detailsForMaster[0].billingChannel : "")
      });

      detailsForMaster.forEach(dtoDetail => {
        const contract = new Contract(dtoDetail);

        const linkedLedger = ledgerByContract[contract.id] || [];
        linkedLedger.forEach(dtoL => contract.ledger.push(new LedgerMovement(dtoL)));

        const linkedSplits = splitsByContract[contract.id] || [];
        linkedSplits.forEach(dtoS => contract.splits.push(new AllocationSplit(dtoS)));

        contract.validateIntegrity();
        master.addChild(contract);
      });

      // 👇 FIX: Allineamento controlli per la rigenerazione degli ID orfani o temporanei residui
      if (!master.id || String(master.id).toUpperCase().startsWith("TMP-")) {
        const mCount = finalMasters.filter(fm => String(fm.supplier).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
        const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
        master.id = this.generateId("MCT", master.supplier, master.assetName, mYear, mCount);
      }

      master.childContracts.forEach(c => {
        // 👇 FIX: Allineamento controlli per le righe contratto
        if (!c.id || String(c.id).toUpperCase().startsWith("TMP-")) {
          globalSupplierCount++;
          const cYear = c.startDate ? c.startDate.getFullYear() : new Date().getFullYear();
          c.id = this.generateId("CTR", master.supplier, master.assetName, cYear, globalSupplierCount);
          c.splits.forEach(s => s.contractId = c.id);
          c.ledger.forEach(l => l.contractId = c.id);
        }
        c.masterId = master.id;
      });

      finalMasters.push(master.exportToData(masterInits));

      master.childContracts.forEach(c => {
        finalDetails.push(c.exportToData());
        c.splits.forEach(s => finalSplits.push(s.exportToData()));
        finalLedger = finalLedger.concat(c.exportFullLedger());
      });
    });

    this.repository.overwriteAllMasters(finalMasters);
    this.repository.overwriteAllContracts(finalDetails);
    this.repository.overwriteAllSplits(finalSplits);
    this.repository.overwriteAllLedger(finalLedger);
  }

  getHydratedContracts() {
    const dtosMasters = this.removeDuplicatesByKey(this.repository.findAllMasters(), "masterId");
    const dtosDetails = this.removeDuplicatesByKey(this.repository.findAllContracts(), "contractId");
    const dtosSplits = this.repository.findAllSplits();
    const dtosLedger = this.repository.findAllLedger();

    const detailsByMaster = this.groupBy(dtosDetails, ["masterId"]);
    const splitsByContract = this.groupBy(dtosSplits, ["contractId"]);
    const ledgerByContract = this.groupBy(dtosLedger, ["contractId"]);

    const hydratedContractsCollection = [];

    dtosMasters.forEach(dtoMaster => {
      const mId = dtoMaster.masterId;
      const detailsForMaster = detailsByMaster[mId] || [];

      const master = new MasterContract({
        ...dtoMaster,
        billingChannel: dtoMaster.billingChannel || (detailsForMaster.length > 0 ? detailsForMaster[0].billingChannel : "")
      });

      detailsForMaster.forEach(dtoDetail => {
        const contract = new Contract(dtoDetail);

        const linkedLedger = ledgerByContract[contract.id] || [];
        linkedLedger.forEach(dtoL => contract.ledger.push(new LedgerMovement(dtoL)));

        const linkedSplits = splitsByContract[contract.id] || [];
        linkedSplits.forEach(dtoS => contract.splits.push(new AllocationSplit(dtoS)));

        master.addChild(contract);
        hydratedContractsCollection.push(contract);
      });
    });

    return hydratedContractsCollection;
  }
}

const ContractDomain = new ContractService();