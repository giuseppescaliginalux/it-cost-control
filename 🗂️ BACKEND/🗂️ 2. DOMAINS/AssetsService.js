/**
 * ============================================================================
 * APPLICATION SERVICE: AssetsService.js
 * ============================================================================
 */

class AssetService {
  constructor() {
    this.repository = new AssetRepository();
    this.contractRepo = new ContractRepository();
    this.initiativeRepo = new InitiativeRepository();
  }

  consolidateBudgets() {
    const dtosAssets = this.repository.findAllAsDto();
    if (dtosAssets.length === 0) return;
    const assets = dtosAssets.map(dto => new Asset(dto));

    const dtosContracts = this.contractRepo.findAllContracts();
    const dtosInitiatives = this.initiativeRepo.findAllAsDto();

    const updatedAssetsPayload = assets.map(asset => {
      // FIX: Join robusta tramite Asset ID invece del nome testuale
      const assetIdString = String(asset.id).trim();
      const assetContracts = dtosContracts.filter(c => String(c.assetId).trim() === assetIdString);
      const assetInits = dtosInitiatives.filter(i => String(i.assetId).trim() === assetIdString);

      asset.injectContext([], assetContracts, assetInits, []);
      return asset.exportToData();
    });

    this.repository.saveAll(updatedAssetsPayload);
  }
}

const AssetDomain = new AssetService();