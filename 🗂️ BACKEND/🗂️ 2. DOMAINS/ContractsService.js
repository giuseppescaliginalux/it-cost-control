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
    const master = new MasterContract({
      ...payload,
      billingChannel: payload.billingChannel || (payload.details.length > 0 ? payload.details[0].billingChannel : "")
    });

    const allContracts = this.repository.findAllContracts();
    let globalSupplierCount = allContracts.filter(c => String(c.supplier).toLowerCase().trim() === String(payload.supplier).toLowerCase().trim()).length;

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

    if (!master.id) {
      const allMasters = this.repository.findAllMasters();
      const mCount = allMasters.filter(m => String(m.supplier).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
      const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
      master.id = this.generateId("MCT", master.supplier, payload.assetName, mYear, mCount);
    }

    master.childContracts.forEach(c => {
      if (!c.id) {
        globalSupplierCount++;
        const cYear = c.startDate ? c.startDate.getFullYear() : new Date().getFullYear();
        c.id = this.generateId("CTR", master.supplier, payload.assetName, cYear, globalSupplierCount);
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
    this.repository.saveMasterRow(exportedMaster);
    this.repository.saveDetailsCollection(master.id, exportedDetails);
    this.repository.wipeAndWriteSplits(contractIds, exportedSplits);
    this.repository.wipeAndWriteLedger(contractIds, exportedLedger);

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

      if (!master.id) {
        const mCount = finalMasters.filter(fm => String(fm.supplier).toLowerCase().trim() === String(master.supplier).toLowerCase().trim()).length + 1;
        const mYear = master.getMinStartDate() ? master.getMinStartDate().getFullYear() : new Date().getFullYear();
        master.id = this.generateId("MCT", master.supplier, master.assetName, mYear, mCount);
      }

      master.childContracts.forEach(c => {
        if (!c.id) {
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