# Documentazione Architetturale: Motore di Proiezione FinOps IT

Questo documento descrive le specifiche funzionali, le regole logico-matematiche e l'architettura dei dati del sistema di controllo dei costi IT e di proiezione dei budget pluriennali (FY26, FY27, FY28).

---

## 1. Governance del Dominio Dati (I 4 Parametri Chiave)

La scomposizione analitica dei contratti impedisce la sovrapposizione concettuale tra modelli di prezzo, allocazioni temporali e regole di rinnovo futuro. Ogni contratto sul foglio `Contracts` viene profilato secondo quattro dimensioni:

### 1.1 Pricing Model (Il "Quanto")
Definisce la natura commerciale della tariffa pattuita con il fornitore:
* **`Flat`**: Canone fisso, costante e ricorrente (es. canoni di licensing standard o manutenzioni).
* **`Pure Consumption`**: Modello a consumo puro senza barriere (es. servizi cloud ad accensione elastica come AWS o Azure senza commit).
* **`Minimum Consumption`**: Modello ibrido strutturato su un minimo garantito ed invalicabile (`Total Commitment`), oltre il quale scattano gli extra-costi a consumo.

### 1.2 Commitment Allocation (Il "Come")
Determina la metodologia di scomposizione ed inserimento del budget lungo il calendario contrattuale:
* **`Linear`**: Il motore ripartisce in autonomia il valore economico in quote giornaliere speculari (`Annual Value / 365`) distribuendole pro-rata sui mesi fiscali.
* **`Ledger-Driven`**: L'automatismo lineare viene disattivato. Il motore si congela ed elegge come unica fonte di verità i flussi di cassa o ratei immessi manualmente dall'utente nella tabella `Ledger`.

### 1.3 Cost Recurrence (Il "Dopo")
Istruisce il sistema sul destino economico dell'asset al raggiungimento della sua data di scadenza contrattuale (`End Date` o `Adjusted End Date`):
* **`One-Shot`**: L'asset cessa di esistere finanziariamente. Dal giorno successivo alla scadenza, la sua proiezione crolla istantaneamente e definitivamente a **0€**.
* **`Recurrent`**: L'asset descrive un servizio vitale. Al superamento della data di fine contratto, il motore innesca un **rinnovo virtuale**, continuando a proiettare la quota annualizzata standard (`Annual Value`) per garantire la copertura economica nei Fiscal Year successivi.

### 1.4 Billing Frequency (La Cassa)
Parametro organizzativo e descrittivo (`Monthly`, `Quarterly`, `Upfront Yearly`, `Upfront Pluriennale`). Agisce come semaforo procedurale per la configurazione:
* Se un contratto è fatturato in modalità *Upfront* (Yearly o Pluriennale), la governance impone di impostare la *Commitment Allocation* su **`Ledger-Driven`** per mappare l'uscita finanziaria singola nel Ledger, azzerando i mesi e gli anni fiscali non impattati da movimenti monetari reali.

---

## 2. Il Registro delle Eccezioni (`Ledger`)

La tabella del `Ledger` agisce come il database di sovrascrittura delle regole standard. I record sono governati dal campo `Type`:
* **`ACTUAL`**: Movimenti certi immessi dall'utente (fatture d'anticipo CAPEX, milestone di sviluppo, consuntivi di consumo cloud).
* **`CALCULATED`**: Righe previsionali temporanee generate automaticamente dal modulo `ledger_engine.js`.

### 2.1 Regola Predittiva del Ledger (Sbarramento Anti-Costi Fantasma)
La funzione `regenerateLedgerCalculatedProjections()` esegue un purge preventivo dei vecchi record predittivi e applica una restrizione atomica per evitare la proliferazione di ratei fittizi:
* **Filtro d'ingresso**: Vengono elaborati unicamente i contratti attivi con `Pricing Model === "Minimum Consumption"` AND `Commitment Allocation === "Ledger-Driven"`.
* **Meccanismo**: Lo script analizza i mesi contrattuali non coperti da record storici `ACTUAL`. Se la spesa cumulativa attuale non raggiunge il `Total Commitment`, il motore forza la creazione di righe `CALCULATED` mensili valorizzate sulla quota rimanente necessaria a saturare il commitment contrattuale entro la data di scadenza.
* **Scudo Upfront**: I contratti ad anticipo fisso (`Flat` + `Ledger-Driven`) saltano questo automatismo. Nel registro rimarranno solo le fatture reali inserite a mano dall'utente, azzerando i mesi residui.

---

## 3. pipeline Analitica delle Proiezioni Fiscali

Le proiezioni corrono in memoria all'interno del file `projections_engine.js`. Il calcolo avviene in parallelo per abbattere la complessità computazionale ($O(1)$) tramite tabelle hash a dizionario, valorizzando simultaneamente i campi ufficiali del foglio `FiscalProjections`.

### 3.1 Finestre Temporali di Competenza Fiscale
Il motore perimetra rigidamente i confini dei Fiscal Year di riferimento:
* **`FY26`**: 01/07/2025 – 30/06/2026
* **`FY27`**: 01/07/2026 – 30/06/2027
* **`FY28`**: 01/07/2027 – 30/06/2028

Lo script calcola l'intersezione in giorni (`Days_In_FY`) fra l'anno fiscale esaminato e la finestra di validità del contratto. Se i giorni di intersezione sono pari a zero, l'output economico è immediatamente impostato a **0€**.

### 3.2 Modelli Economici di Calcolo

#### Ramo 1: Calcolo Baseline Ufficiale
1.  **Ripartizione Standard (`Linear`)**: Calcola il costo basandosi puramente sul rateo giornaliero:
    $$\text{Importo Baseline} = \left(\frac{\text{Annual Value}}{365}\right) \times \text{Giorni Competenza FY}$$
2.  **Ripartizione di Cassa (`Ledger-Driven`)**: Il calcolo lineare si spegne. Il motore estrae dal Ledger tutti i movimenti associati al `Group ID` dell'asset e calcola il pro-rata esatto basandosi sull'effettiva sovrapposizione temporale dei singoli movimenti con il Fiscal Year analizzato.
3.  **Innesco Rollover**: Se il contratto scade all'interno del Fiscal Year ed è contrassegnato come `Recurrent`, per il sotto-periodo che va dal giorno successivo alla scadenza fino al termine del Fiscal Year viene applicato il Run Rate lineare standard, sommandolo alle evidenze estratte dal Ledger.

#### Ramo 2: Calcolo Optimized Ufficiale
Il calcolo Optimized eredita i paletti temporali della Baseline ma esegue l'iniezione asincrona della matrice delle `Initiatives` collegate al `Group ID`, processando array strutturati per supportare iniziative simultanee ed evitare sovrascritture in memoria:
* **Iniziative di Optimization (Rinegoziazioni/Saving)**: Lo script calcola il peso proporzionale del singolo contratto all'interno del suo gruppo d'acquisto (`Annual Value / Group Total Annual Value`), alloca la quota parte del `Target Saving (Annualized)` e scompone l'anno fiscale in due frazioni tariffarie distinte rispetto alla data target dell'iniziativa:
    * *Giorni Pre-Iniziativa*: Valorizzati alla tariffa giornaliera baseline standard.
    * *Giorni Post-Iniziativa*: Valorizzati alla tariffa giornaliera ottimizzata al netto del saving proporzionale.
* **Iniziative di Dismissione (`Termination`, `Terminate`, `Replace`, `Transfer`)**: Agiscono come un blocco temporale distruttivo assoluto (`Absolute Cap`). Qualsiasi giorno di rinnovo virtuale o movimento predittivo del Ledger situato oltre la data reale di dismissione viene troncato istantaneamente a **0€**, certificando l'azzeramento definitivo dei costi post-switch off.

---

## 4. Walkthrough Matematico (Esempio di Validazione)

Per attestare la robustezza logica del sistema, si analizza il comportamento del motore su un asset complesso affetto da upfront pluriennale ed iniziative conflittuali:

* **Metadati Contratto**: Valore 700.000€ su 24 mesi (Durata: 01/11/2024 – 31/10/2026) $\rightarrow$ `Annual Value` = 350.000€, `Cost Recurrence` = `Recurrent`, `Commitment Allocation` = `Ledger-Driven`.
* **Stato del Ledger**: Movimento unico Upfront registrato in data 01/11/2024 (Finanziariamente situato nel passato all'interno del **FY25**). Il Ledger è vuoto nei periodi successivi.
* **Matrice Iniziative**:
    1.  *Iniziativa A (Optimization)*: Target Saving di 35.000€ con data target 31/10/2026.
    2.  *Iniziativa B (Termination)*: Dismissione totale con data target 31/12/2027.

### Risultati dei Calcoli Generati dal Sistema

#### 4.1 Proiezioni FY26 (01/07/2025 – 30/06/2026)
* **`FY26 Baseline` = 0,00€**
    * *Logica*: Essendo `Ledger-Driven`, il motore legge solo il Ledger corrente. Non trovando righe (l'upfront è nel FY25), restituisce zero. La scadenza è nel futuro, quindi il rollover virtuale è inerte.
* **`FY26 Optimized` = 0,00€**
    * *Logica*: Speculare alla baseline. L'ottimizzazione tariffaria non è ancora attiva sul calendario corrente.

#### 4.2 Proiezioni FY27 (01/07/2026 – 30/06/2027)
Il contratto scade il 31/10/2026. L'anno fiscale viene spaccato in due: i primi **123 giorni** (fino al 31/10) sono a budget 0€ (guidati dal Ledger vuoto), i successivi **242 giorni** (fino al 30/06) sono coperti dal rinnovo virtuale.
* **`FY27 Baseline` = 232.054,79€**
    * *Calcolo*: $0.00€ + \left( \frac{350.000€}{365} \times 242 \text{ giorni} \right) = 232.054,79€$
* **`FY27 Optimized` = 208.849,32€**
    * *Calcolo*: Lo script intercetta l'Iniziativa A. Dal 01/11/2026 la tariffa annua del rinnovo cala a 315.000€ ($350.000€ - 35.000€$).
    * $$\text{Importo} = 0.00€ + \left( \frac{315.000€}{365} \times 242 \text{ giorni} \right) = 208.849,32€$$

#### 4.3 Proiezioni FY28 (01/07/2027 – 30/06/2028)
L'anno fiscale risiede interamente nell'area del rinnovo virtuale. L'Iniziativa B (Termination al 31/12/2027) interrompe l'erogazione: l'asset è attivo per i primi **184 giorni** dell'anno e spento per i restanti **181 giorni**.
* **`FY28 Baseline` = 350.000,00€**
    * *Calcolo*: La baseline ignora le dismissioni e stanzia l'accantonamento standard per l'intera annualità: $\frac{350.000€}{365} \times 365 = 350.000,00€$.
* **`FY28 Optimized` = 158.794,52€**
    * *Calcolo*: L'algoritmo multi-iniziativa applica l'Optimization per i 184 giorni pre-chiusura e azzera radicalmente la tariffa giornaliera per i 181 giorni post-chiusura.
    * $$\text{Importo} = \left( \frac{315.000€}{365} \times 184 \text{ giorni} \right) + \left( 0.00€ \times 181 \text{ giorni} \right) = 158.794,52€$$