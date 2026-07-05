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
* **`Linear`**: Il motore ripartisce in autonomia il valore economico in quote speculari distribuendole pro-rata sui mesi fiscali.
* **`Ledger-Driven`**: L'automatismo lineare viene disattivato. Il motore si congela ed elegge come unica fonte di verità i flussi di cassa o ratei immessi manualmente dall'utente nella tabella `Ledger`. (Da usare solo per flussi irregolari o imprevedibili).

### 1.3 Cost Recurrence (Il "Dopo")
Istruisce il sistema sul destino economico dell'asset al raggiungimento della sua data di scadenza contrattuale (`End Date` o `Adjusted End Date`):
* **`One-Shot`**: L'asset cessa di esistere finanziariamente. La proiezione crolla istantaneamente e definitivamente a **0€**. Il costo viene tipicamente assorbito per intero nel Fiscal Year in cui ricade la `Start Date`.
* **`Recurrent`**: L'asset descrive un servizio vitale. Al superamento della data di fine contratto, il motore innesca un **rinnovo virtuale**, continuando a proiettare la quota annualizzata standard (`Annual Value`) per garantire la copertura economica nei Fiscal Year successivi.

### 1.4 Billing Terms (Frequenza e Modalità)
Parametro organizzativo che definisce la frequenza di fatturazione (`Linear`, `Quarterly`, `Full Upfront`, `Ledger-Driven`):
* **`Full Upfront`**: Pagamento anticipato totale. Essendo un evento temporalmente e finanziariamente deterministico (tutto il commitment alla `Start Date`), il sistema lo gestisce nativamente. **Non è necessario** impostare il contratto su `Ledger-Driven` né compilare manualmente righe nel Ledger.
* **`Ledger-Driven`**: Da usare *esclusivamente* quando la fatturazione è così irregolare (es. milestone di progetto, servizi a chiamata) da non poter essere dedotta matematicamente, rendendo obbligatorio l'inserimento manuale dei movimenti nel Ledger da parte dell'utente.

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

## 3. Pipeline Analitica delle Proiezioni Fiscali

Le proiezioni corrono in memoria all'interno del file `Projections.js`. Il calcolo avviene in parallelo per abbattere la complessità computazionale ($O(1)$) tramite tabelle hash a dizionario, valorizzando simultaneamente i campi ufficiali del foglio `FiscalProjections`.

### 3.1 Finestre Temporali di Competenza Fiscale
Il motore perimetra rigidamente i confini dei Fiscal Year di riferimento:
* **`FY26`**: 01/07/2025 – 30/06/2026
* **`FY27`**: 01/07/2026 – 30/06/2027
* **`FY28`**: 01/07/2027 – 30/06/2028

Lo script calcola l'intersezione in giorni (`Days_In_FY`) fra l'anno fiscale esaminato e la finestra di validità del contratto. Se i giorni di intersezione sono pari a zero, l'output economico è immediatamente impostato a **0€**.

### 3.2 Modelli Economici di Calcolo

#### Ramo 1: Calcolo Baseline Ufficiale
1.  **Standard ERP Monthly Pro-Rata**: Il motore distribuisce il canone annuo in 12 mensilità esatte (`Annual Value / 12`). I mesi pienamente coperti ricevono la quota intatta per prevenire micro-fluttuazioni da calendario. Solo i mesi di sbarramento (inizio/fine contratto) vengono riproporzionati sui giorni commerciali effettivi.
2.  **Ripartizione di Cassa (`Ledger-Driven`)**: Il calcolo lineare si spegne. Il motore estrae dal Ledger tutti i movimenti associati all'asset e calcola il pro-rata esatto basandosi sull'effettiva sovrapposizione temporale dei movimenti con il Fiscal Year analizzato.
3.  **Innesco Rollover**: Se il contratto scade all'interno del Fiscal Year ed è `Recurrent`, per il periodo post-scadenza viene applicato il Run-Rate nominale standard (rinnovo virtuale), a meno che non intervenga un contratto successore anagrafato a bloccarlo.

#### Ramo 2: Calcolo Optimized Ufficiale e Regole di Business
Il calcolo Optimized eredita i paletti temporali della Baseline ma inietta la matrice delle `Initiatives` applicando due regole fondamentali di FinOps Governance:

* **Regola 1: Target Date "Naturale" (Go-Live Inclusivo)**
  La `Target Date` immessa dall'utente rappresenta la data esatta di entrata in vigore. Se si fissa un'iniziativa al `01/01/2027`, l'ottimizzazione o l'azzeramento dei costi parte ESATTAMENTE dalla mattina del 1° Gennaio.
  
* **Regola 2: Gradini di Run-Rate (Cascata Moltiplicativa)**
  Quando più iniziative di `OPTIMIZE` insistono sullo stesso Master Agreement lungo il tempo, il sistema **non** accumula le percentuali (es. -10% e poi -20% non fa -30%). L'algoritmo applica una **cascata moltiplicativa sequenziale** per far sì che ogni iniziativa definisca un nuovo livello di Run-Rate stabile e duraturo a partire dalla sua data target. Questo permette all'utente di definire il nuovo *Target Cost* (es. prima rinegozio a 80k, poi l'anno dopo scendo a 50k) sapendo che l'algoritmo vi atterrerà spaccando il centesimo.

* **Iniziative di Dismissione (`TERMINATE`, `REPLACE`, `TRANSFER`)**:
  Agiscono come un interruttore definitivo (`Absolute Cap`). A partire dalla `Target Date` (inclusa), la spesa del contratto viene troncata istantaneamente a **0€**.

---

## 4. Walkthrough Matematico (Esempio di Validazione)

Per attestare la robustezza logica del sistema (confermata dai test unitari), si analizza il comportamento del motore ERP Pro-Rata su un asset complesso:

* **Metadati Contratto**: Valore 700.000€ su 24 mesi (Durata: 01/11/2024 – 31/10/2026) $\rightarrow$ `Annual Value` = 350.000€, `Cost Recurrence` = `Recurrent`, `Commitment Allocation` = `Ledger-Driven`.
* **Stato del Ledger**: Movimento unico Upfront registrato in data 01/11/2024 (Finanziariamente situato nel passato all'interno del **FY25**). Il Ledger è vuoto nei periodi successivi.
* **Matrice Iniziative**:
    1.  *Iniziativa A (Optimization)*: Rinegozia il Run-Rate a 315.000€ (Sconto di 35.000€). Target Date per il Go-Live: **01/11/2026**.
    2.  *Iniziativa B (Termination)*: Dismissione totale. Target Date per lo spegnimento: **01/01/2028**.

### Risultati dei Calcoli Generati dal Sistema

#### 4.1 Proiezioni FY26 (01/07/2025 – 30/06/2026)
* **`FY26 Baseline` = 0,00€**
    * *Logica*: Essendo `Ledger-Driven`, il motore legge solo il Ledger corrente. Non trovando righe (l'upfront è nel FY25), restituisce zero. La scadenza è nel futuro, quindi il rollover virtuale è inerte.
* **`FY26 Optimized` = 0,00€**
    * *Logica*: Speculare alla baseline. L'ottimizzazione tariffaria non è ancora attiva sul calendario corrente.

#### 4.2 Proiezioni FY27 (01/07/2026 – 30/06/2027)
Il contratto scade il 31/10/2026. L'anno fiscale viene spaccato in due: i primi 4 mesi esatti (fino al 31/10) sono a budget 0€ (guidati dal Ledger vuoto). Dal 1° Novembre scatta il Rollover Virtuale.
* **`FY27 Baseline` = 233.333,33€**
    * *Calcolo*: 8 mesi pieni di Rollover (da Novembre a Giugno inclusi) $\rightarrow$ $\frac{350.000€}{12} \times 8 \text{ mesi} = 233.333,33€$
* **`FY27 Optimized` = 210.000,00€**
    * *Calcolo*: Lo script intercetta l'Iniziativa A con decorrenza esatta dal 01/11/2026. La tariffa annua del rinnovo cala al gradino target di 315.000€.
    * $$\text{Importo} = \left( \frac{315.000€}{12} \times 8 \text{ mesi} \right) = 210.000,00€$$

#### 4.3 Proiezioni FY28 (01/07/2027 – 30/06/2028)
L'anno fiscale risiede interamente nell'area del rinnovo virtuale. L'Iniziativa B (`TERMINATE` al 01/01/2028) spegne il server la mattina di Capodanno: l'asset è attivo per i primi 6 mesi dell'anno (Luglio-Dicembre) e spento per i successivi 6 mesi.
* **`FY28 Baseline` = 350.000,00€**
    * *Calcolo*: La baseline ignora le dismissioni e stanzia l'accantonamento per i 12 mesi intatti $\rightarrow 350.000,00€$.
* **`FY28 Optimized` = 157.500,00€**
    * *Calcolo*: Il motore pro-rata rileva l'Optimization attiva dal passato e la Termination attiva dal 1° Gennaio. Calcola quindi esattamente 6 mesi a tariffa scontata e 6 mesi a zero.
    * $$\text{Importo} = \left( \frac{315.000€}{12} \times 6 \text{ mesi attivi} \right) + 0,00€ = 157.500,00€$$