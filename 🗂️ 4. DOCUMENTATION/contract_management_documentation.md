# Specifica Funzionale e Tecnica: Motore FinOps Smart & Strategia TDD

Questo documento definisce l'architettura logica, le regole di validazione dell'interfaccia utente (UI) e la strategia di sviluppo guidato dai test (Test-Driven Development - TDD) per il modulo di gestione e proiezione dei costi IT.

L'obiettivo cardine è implementare il principio del **Minimum Viable Data (MVD)**: richiedere all'operatore il minor numero possibile di informazioni in fase di data-entry, automatizzando la generazione dello scadenziario fatture (Ledger) e le proiezioni finanziarie di fine anno.

---

## 1. La Matrice Decisionale Smart (La Triade FinOps)

Il comportamento del motore di calcolo e la visibilità dei campi nella UI sono determinati dall'incrocio di tre parametri fondamentali:
1. **Expenditure Type (Natura della Spesa):** `OPEX` (Spesa operativa), `CAPEX` (Spesa in conto capitale), `ROU` (Diritto d'uso / Leasing).
2. **Pricing Model (Modello di Tariffazione):** `Flat` (Canone fisso/certo), `Minimum Consumption` (Consumo con minimo garantito), `Capped Consumption` (Consumo con tetto massimo). *Nota: Il modello Pure Consumption è stato rimosso in quanto non conforme alla governance di budget.*
3. **Billing Terms (Condizioni di Cassa):** Definisce come e quando arrivano le fatture. Ridotto a 4 macro-opzioni commerciali.

### Matrice di Comportamento e Vincoli UI

| Billing Terms | Expenditure Type | Pricing Model | Comportamento del Motore | Comportamento del Ledger | Campo 'Billing Frequency' |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Full Upfront / Prepaid`** | `CAPEX` | Bloccato su **`Flat`** | **No Rateizzazione.** 100% del costo imputato al mese della `Start Date`. | **Disabilitato / Nascosto** | Nascosto |
| | `OPEX` o `ROU` | Bloccato su **`Flat`** | **Spalmatura Lineare.** Il costo totale viene ripartito in pro-rata (giorno per giorno) sulla durata del contratto. | **Disabilitato / Nascosto** | Nascosto |
| **`Fixed Recurring`** | `CAPEX` | *Disabilitato* | *(Combinazione bloccata alla fonte dalla UI)* | - | - |
| | `OPEX` o `ROU` | Bloccato su **`Flat`** | **Competenza Lineare + Scadenziario Automatico.** La competenza a budget viene spalmata linearmente. Il Ledger viene popolato automaticamente con le scadenze teoriche delle fatture. | **Abilitato (Autocompilato al 100%)** | **Visibile (Obbligatorio):**<br>`Monthly`, `Quarterly`, `Every 4 Months`, `Bi-Annually`, `Annually` |
| **`Pay-As-You-Go`** | `CAPEX` o `ROU` | *Disabilitato* | *(Combinazione bloccata alla fonte dalla UI)* | - | - |
| | `OPEX` | Abilitato solo su:<br>• `Minimum` <br>• `Capped` | **Previsione a Copertura Budget.** Il motore genera mensilmente movimenti predittivi nel Ledger per occupare lo spazio a budget residuo, evitando il "risparmio fantasma". | **Abilitato & Obbligatorio** | Nascosto (Frequenza implicita mensile) |
| **`Custom / Ledger Driven`**| `CAPEX`, `OPEX`, `ROU` | `Flat`, `Minimum`, `Capped` | **Pilota Manuale.** Il motore matematico si spegne. La proiezione di atterraggio è lo specchio esatto di quanto inserito nel Ledger. | **Abilitato (Input Manuale)** | Nascosto |

---

## 2. Dettaglio Logica di Automazione del Ledger

### A. Contratti `Fixed Recurring` (Il Piano di Fatturazione)
Quando l'utente seleziona `Fixed Recurring` e indica una `Billing Frequency` (es. `Every 4 Months` su un contratto da 12.000€/anno dal 1° Gennaio), il motore calcola matematicamente le scadenze e popola il Ledger con righe aventi stato `CALCULATED`:
* **Scadenza 1 (Mese 1):** 4.000 € (`CALCULATED`) -> Segnaposto logico basato sul mese.
* **Scadenza 2 (Mese 5):** 4.000 € (`CALCULATED`)
* **Scadenza 3 (Mese 9):** 4.000 € (`CALCULATED`)

**Processo di Invoice Clearing (Approvazione Fatture):**
All'arrivo della fattura reale dal fornitore, il manager apre il Ledger dell'asset, individua la riga `CALCULATED` corrispondente a quel mese, verifica la congruenza dell'importo (Match) e clicca su "Approva". L'azione muta lo stato della riga in `ACTUAL` e consente facoltativamente di sovrascrivere il giorno esatto della fattura.

### B. Contratti `Pay-As-You-Go` (Protezione del Commitment)
Per evitare che una spesa a consumo non ancora fatturata venga letta dalla Dashboard come un risparmio (Surplus), il motore applica la seguente formula di rispalmatura mensile automatica per i mesi futuri del medesimo Anno Fiscale:

$$\text{Quota Mensile Forecast} = \frac{\text{Total Commitment} - \sum(\text{Fatture ACTUAL})}{\text{Mesi Rimanenti a Fine Anno Fiscale}}$$

Ogni volta che viene inserita una fattura reale (`ACTUAL`), il motore ricalcola il residuo e aggiorna le righe future `CALCULATED`.

---

## 3. Logica dei Grafici della Dashboard (YTD vs ROY)

Per consentire la spaccatura visiva tra **Speso Reale (Year-To-Date - YTD)** e **Previsione Residua (Rest-Of-Year - ROY)**, la Dashboard interroga i dati aggregandoli secondo due metriche distinte a seconda della natura del contratto:

1. **Per i contratti basati su Ledger (`Fixed Recurring`, `Pay-As-You-Go`, `Custom`):**
   * **YTD Actuals:** Somma di tutti i movimenti con etichetta `ACTUAL`.
   * **ROY Forecast:** Somma di tutti i movimenti con etichetta `CALCULATED` o `FORECAST`.
2. **Per i contratti Flat lineari senza Ledger (`Full Upfront / Prepaid` OPEX/ROU):**
   * Il sistema interroga il calendario rispetto alla data odierna (`CurrentDate`):
     * I mesi contrattuali **antecedenti** al mese corrente vengono sommati sotto la voce **YTD Actuals** (Competenza passata consolidata).
     * I mesi contrattuali **futuri o uguali** al mese corrente vengono sommati sotto la voce **ROY Forecast** (Competenza futura attesa).

$$\text{Total Landing (Proiezione di Atterraggio)} = \text{YTD Actuals} + \text{ROY Forecast}$$

---

## 4. Tabella di Marcia TDD (Test-Driven Development)

L'intera logica server-side verrà implementata partendo dalla scrittura dei casi di test all'interno del file di test designato (`🗂️ 3. TESTS/ContractsTests.js`). Lo sviluppo procederà secondo il ciclo *Red-Green-Refactor*.

### Mappa dei Test Unitari Obbligatori

### 🧪 Gruppo 1: Validazione Regole Interfaccia e Modello di Dominio
* **Test 1.1 (Vincolo CAPEX - Upfront):** Verificare che un contratto inizializzato come `CAPEX` e `Full Upfront` imposti automaticamente il Pricing Model a `Flat` e restituisca `isLedgerDriven() == false` ma con Ledger inibito dalla UI.
* **Test 1.2 (Blocco CAPEX - Recurring):** Verificare che l'inizializzazione di un contratto `CAPEX` con `Fixed Recurring` o `Pay-As-You-Go` sollevi un'eccezione di validazione logica.
* **Test 1.3 (Rimozione Pure Consumption):** Verificare che il sistema non accetti più la stringa `Pure Consumption` come Pricing Model valido.

### 🧪 Gruppo 2: Automazione del Ledger (Piani di Fatturazione)
* **Test 2.1 (Generazione Fixed Recurring Quadrimestrale):** Creare un contratto `Fixed Recurring`, `Flat`, `OPEX`, valore 12.000€, durata 12 mesi, frequenza `Every 4 Months`. Verificare che la funzione di generazione del Ledger restituisca esattamente 3 movimenti di tipo `CALCULATED`, ciascuno di importo pari a 4.000€, posizionati correttamente a intervalli di 4 mesi.
* **Test 2.2 (Generazione Pay-As-You-Go con Ricalcolo):** Creare un contratto `Pay-As-You-Go`, `Capped Consumption`, `OPEX`, Commitment 1.000€, durata 12 mesi (Gennaio-Dicembre). In assenza di Actuals, verificare che generi 12 righe `CALCULATED` da 83.33€. Simulare l'inserimento a Marzo di una riga `ACTUAL` da 200€ e verificare che le righe da Aprile a Dicembre vengano rimodulate a (1.000 - 200) / 9 = 88.88€.

### 🧪 Gruppo 3: Calcolo delle Proiezioni per la Dashboard (YTD vs ROY)
* **Test 3.1 (Oracolo del Tempo per contratti Flat lineari):** Creare un contratto `Full Upfront`, `Flat`, `OPEX` da 12.000€ per l'intero anno 2026. Fissando la data di sistema a fine Aprile 2026, verificare che la funzione di split per la dashboard restituisca esattamente: `YTD Actuals = 4.000€` e `ROY Forecast = 8.000€`.
* **Test 3.2 (Split su contratti con Ledger):** Creare un contratto `Fixed Recurring` con 2 righe `ACTUAL` da 4.000€ nel passato e 1 riga `CALCULATED` da 4.000€ nel futuro. Verificare che la dashboard legga correttamente `YTD Actuals = 8.000€` e `ROY Forecast = 4.000€`, indipendentemente dai mesi di calendario trascorsi.