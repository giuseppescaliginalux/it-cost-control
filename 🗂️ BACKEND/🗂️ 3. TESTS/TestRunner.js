/**
 * ============================================================================
 * FINOPS ENTERPRISE ARCHITECTURE: CORE TESTING INFRASTRUCTURE
 * ============================================================================
 * Registro globale e motore di esecuzione isolato in RAM per gli Unit Test.
 * ============================================================================
 */

// Registro globale dove i singoli file di dominio registreranno i propri test
const GLOBAL_TEST_REGISTRY = {
  contracts: [],
  initiatives: [],
  projections: [],
  utils: [],
  assets: []
};

/**
 * MACRO AUTOMATICA 1: Lancia la rete di sicurezza su TUTTI i domini dell'applicazione.
 */
function test_LAUNCH_ALL_SUITES() {
  const runner = new MiniTestFramework();
  console.log("=== 🧪 AVVIO CORE SUITE: VALIDAZIONE GLOBALE ECOSYSTEM ===");
  
  // Raggruppa ed esegue l'intera galassia dei test registrati
  const allTests = [
    ...GLOBAL_TEST_REGISTRY.contracts,
    ...GLOBAL_TEST_REGISTRY.initiatives,
    ...GLOBAL_TEST_REGISTRY.projections,
    ...GLOBAL_TEST_REGISTRY.utils,
    ...GLOBAL_TEST_REGISTRY.assets
  ];
  
  runner.execute(allTests);
}

/**
 * MACRO AUTOMATICA 2: Lancia i test dedicati esclusivamente al Dominio CONTRATTI.
 */
function test_SUITE_Contracts_Only() {
  const runner = new MiniTestFramework();
  console.log("=== 🧪 AVVIO SUITE SELETTIVA: DOMINIO CONTRATTI ===");
  runner.execute(GLOBAL_TEST_REGISTRY.contracts);
}

/**
 * MACRO AUTOMATICA 3: Lancia i test dedicati esclusivamente al Dominio INIZIATIVE.
 */
function test_SUITE_Initiatives_Only() {
  const runner = new MiniTestFramework();
  console.log("=== 🧪 AVVIO SUITE SELETTIVA: DOMINIO INIZIATIVE ===");
  runner.execute(GLOBAL_TEST_REGISTRY.initiatives);
}

/**
 * MACRO AUTOMATICA 4: Lancia i test dedicati esclusivamente al Dominio PROIEZIONI.
 */
function test_SUITE_Projections_Only() {
  const runner = new MiniTestFramework();
  console.log("=== 🧪 AVVIO SUITE SELETTIVA: DOMINIO PROIEZIONI ===");
  runner.execute(GLOBAL_TEST_REGISTRY.projections);
}

function test_SUITE_Utils_Only() {
  const runner = new MiniTestFramework();
  console.log("=== 🧪 AVVIO SUITE SELETTIVA: UTILS ===");
  runner.execute(GLOBAL_TEST_REGISTRY.utils);
}

function test_SUITE_Assets_Only() {
  const runner = new MiniTestFramework();
  console.log("=== 🧪 AVVIO SUITE SELETTIVA: ASSETS ===");
  runner.execute(GLOBAL_TEST_REGISTRY.assets);
}

// ============================================================================
// L'INGEGNERIA DEL FRAMEWORK (IL MOTORE EMULATORE)
// ============================================================================
class MiniTestFramework {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  execute(testsArray) {
    if (testsArray.length === 0) {
      console.warn("Nessun unit test configurato o registrato per questa selezione.");
      return;
    }

    const assert = {
      equal: (actual, expected) => {
        if (actual !== expected) throw new Error(`Atteso [${expected}], ma ricevuto [${actual}]`);
      },
      closeTo: (actual, expected, tolerance) => {
        if (Math.abs(actual - expected) > tolerance) {
          throw new Error(`Atteso circa [${expected}] (tolleranza ±${tolerance}), ma ricevuto [${actual}]`);
        }
      },
      true: (actual, msg) => {
        if (actual !== true) throw new Error(msg || `Atteso [true], ma ricevuto [${actual}]`);
      },
      false: (actual, msg) => {
        if (actual !== false) throw new Error(msg || `Atteso [false], ma ricevuto [${actual}]`);
      },
      throws: (fn, expectedErrorText) => {
        try {
          fn();
        } catch (e) {
          if (expectedErrorText && !e.message.includes(expectedErrorText)) {
            throw new Error(`Lanciata eccezione errata: ${e.message}`);
          }
          return;
        }
        throw new Error("Il blocco di codice non ha sollevato l'eccezione di sicurezza attesa.");
      }
    };

    testsArray.forEach(t => {
      try {
        t.fn(assert);
        this.passed++;
        console.log(`🟢 [PASS] ${t.description}`);
      } catch (error) {
        this.failed++;
        console.error(`🔴 [FAIL] ${t.description}\n   👉 Dettaglio: ${error.message}`);
      }
    });

    this.printReport();
  }

  printReport() {
    console.log("-------------------------------------------------------------------");
    console.log(`📊 REPORT TESTING: ${this.passed} Passati | ${this.failed} Falliti`);
    console.log("-------------------------------------------------------------------");
    if (this.failed > 0) {
      throw new Error("⚠️ DEPLOY BLOCKED: Rilevate regressioni funzionali nel motore FinOps!");
    } else {
      console.log("🚀 PRODUCTION READY: Il codice è integro e stabile al 100%.");
    }
  }
}