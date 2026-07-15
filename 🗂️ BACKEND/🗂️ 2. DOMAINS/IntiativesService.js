/**
 * ============================================================================
 * APPLICATION SERVICE: InitiativesService.js
 * ============================================================================
 */

class InitiativeService {
  constructor() { 
    this.repository = new InitiativeRepository(); 
    this.contractRepo = new ContractRepository();
  }

  processAndSync(dtosArray) {
    if (!dtosArray || !Array.isArray(dtosArray)) return "SUCCESS";
    
    const activeMasters = this.contractRepo.findAllMasters();
    const activeContracts = this.contractRepo.findAllContracts();

    const finalExportedPayloads = dtosArray.map((dto, idx) => {
      const initiative = new Initiative(dto);

      const parentMaster = activeMasters.find(m => String(m.masterId).trim() === String(initiative.masterId).trim());
      const childContracts = activeContracts.filter(c => String(c.masterId).trim() === String(initiative.masterId).trim());

      initiative.injectContext(parentMaster, childContracts);
      if (!initiative.id) initiative.id = `INC-FIN-${new Date().getFullYear()}-${String(idx + 1).padStart(2, '0')}`;

      return initiative.exportToData();
    });

    this.repository.saveAllBulk(finalExportedPayloads);
    return "SUCCESS";
  }

  forceRecalculateAll() {
    const allInitsDtos = this.repository.findAllAsDto();
    this.processAndSync(allInitsDtos);
  }
}

const InitiativeDomain = new InitiativeService();