# Ithaca — revisione dei processi

20 settembre 2026. Confronto con la versione già rifattorizzata (quattro viste, più globale, form progressivi e viste derivate), non con la versione originaria del repository.

## Prima e dopo

I tap indicano azioni di navigazione e salvataggio: non includono digitazione, apertura della tastiera, selezione dei valori o scorrimento. Sono conteggi del percorso, non misure raccolte con utenti reali.

| Processo | Prima | Dopo | Miglioramento |
| --- | --- | --- | --- |
| Creo un viaggio incompleto | Nuovo viaggio → nome, date facoltative → Crea | Stesso percorso; ingresso diretto nel viaggio | Già semplice: 2 azioni dalla Home, nessuna configurazione aggiunta |
| Aggiungo il primo volo | + → Volo → 5 campi iniziali → salva | + → Volo → tratta, data e ora → salva; costo nei dettagli | 5 → 4 campi visibili; stesso editor completo |
| Salvo un hotel | + → Soggiorno → nome, date, costo → salva | Stesso percorso; destinazione precompilata solo quando univoca | 4 campi, 3 azioni; il soggiorno futuro pertinente compare in dashboard |
| Creo un'attività dalla Timeline | + → Attività → reinserisco il giorno → salva | + sulla giornata → Attività → giorno già inserito → salva | Una data da reinserire in meno; contesto esplicito nel menu |
| Aggiungo 3 attività nello stesso giorno | Ripeto + → Attività → salva tre volte | + → Attività → Salva e aggiungi → Salva e aggiungi → Salva | 9 → 5 azioni, data e destinazione conservate; titolo, ora, costo e prenotazione ripartono vuoti |
| Registro una spesa | + → cerco Spesa nel menu → compilo → salva | In Budget Spesa è la prima scelta; resta anche Aggiungi spesa | Meno ricerca visiva; importo nella valuta del viaggio; oggi proposto solo durante il viaggio |
| Segno una prenotazione pagata | Apri record → dettagli → cambia stato → salva | Segna pagato, direttamente in Budget | 4 → 1 azioni; Annulla ripristina il pagamento precedente |
| Scrivo una nota | + → Nota → testo/titolo → salva | Invariato | Già 2 campi iniziali; nessuna configurazione ulteriore |
| Compilo una checklist | Riapro il menu dopo ogni task | Salva e aggiungi, mantenendo sezione e scadenza | 9 → 5 azioni per 3 elementi |
| Modifico da Dashboard/Timeline/Budget/Archivio | Riga → editor originale → salva | Stesso editor, valuta esplicita e prenotazione subito visibile se presente | Nessuna copia del dato; ritorno al contesto di partenza |
| Elimino un record | Pulsante Elimina sempre visibile → conferma | … → Elimina → una conferma | Un tap in più per l'azione rara; meno pulsanti per riga. Le viste derivate si aggiornano automaticamente |
| Cerco Gracery/AZ123 | Ricerca in un modal; dopo la modifica i risultati spariscono | Cerca → Archivio con campo attivo → risultato → editor → stessi risultati | Query e filtro conservati; una sola lista di ricerca |
| Consulto la prenotazione dell'hotel | Riga o dettagli dell'editor | Riga con etichetta Prenotazione; riferimento visibile in testa all'editor | Non occorre espandere i dettagli per leggere il codice |
| Controllo oggi | Prossimo separato dagli altri eventi di oggi | Oggi con tutti gli eventi e indicazione Prossimo sulla riga pertinente | Giornata completa e senza ripetere lo stesso evento in due blocchi |
| Controllo quanto devo pagare | Dashboard → Vedi pagamenti | Stesso percorso, con Segna pagato sulle voci | 1 azione per il dettaglio; include anche gli importi parzialmente pagati |
| Consulto il viaggio attivo | Home ordinata per creazione | Viaggio in corso per primo, poi futuri, senza date e conclusi | L'attivo si raggiunge con un tap dalla Home, senza apertura automatica imposta |
| Riprendo un vecchio viaggio | Elenco completo | Elenco completo; conclusi ordinati dal più recente | Nessun dato nascosto o percorso aggiuntivo |
| Creo un secondo viaggio | Home → Nuovo → Crea | Invariato | Nessun wizard aggiunto; contesto e dati restano separati per viaggio |
| Uso Indietro con un editor aperto | Il cambio di route poteva lasciare il modal aperto | Indietro chiude prima il modal; con modifiche richiede una sola conferma | Lista → editor → lista, senza uscire dal viaggio |

## Default e prevedibilità

- Il viaggio corrente e la sua valuta sono già noti: non vengono richiesti nuovamente.
- Il giorno premuto in Timeline viene passato al nuovo record. Data e destinazione rimangono modificabili.
- Per attività, spese ed eventi, oggi è proposto solo se il viaggio è in corso; nessuna data viene inventata per viaggi senza date o futuri.
- Una destinazione viene scelta solo quando corrisponde univocamente al giorno, oppure quando il viaggio ne ha una sola.
- Il menu + cambia solo l'ordine delle categorie, mai le categorie disponibili.
- Salva e aggiungi conserva il contesto; non copia costi, importi pagati, titoli o prenotazioni. Invio continua a significare Salva e chiudi.
- Nessun nuovo autosalvataggio. Salvataggio esplicito e azioni sticky rimangono il modello principale.

## Mobile e recupero delle informazioni

Rimangono bottom sheet, più globale, navigazione inferiore, pulsanti da almeno 44 px, campi con testo da 16 px e footer di salvataggio raggiungibile nei form lunghi. Le righe usano il tocco sul contenuto per aprire l'editor, la stella per l'evidenza e un menu secondario per l'eliminazione. Il codice prenotazione è leggibile e selezionabile senza espandere i dettagli. Il riepilogo Oggi viene ricalcolato tornando all'app, se non c'è un modulo aperto.

## File principali

- `js/entryContext.js`: ordine del menu e default prevedibili, inclusi gli inserimenti consecutivi.
- `js/components/tripActions.js`, `progressiveForm.js`, `recordRow.js`, `toast.js`: flussi rapidi condivisi.
- `js/components/modal.js`, `modalHistory.js`: storia del modal, chiusura e conservazione del contesto.
- `js/views/dossierForms.js`, `checklistView.js`, `timelineView.js`, `budgetView.js`: integrazione dei flussi di creazione e pagamento.
- `js/views/archiveView.js`: ricerca con risultati persistenti, categorie e empty state specifici.
- `js/selectors.js`, `tripDashboardView.js`, `homeView.js`: soggiorno pertinente, giornata completa e priorità dei viaggi attivi.
- `js/storage.js`: aggiornamento del pagamento sul record originale; nessuna nuova entità o copia economica.
- `css/workspace.css`, `js/app.js`, `service-worker.js`: mobile, ritorno all'app e nuovi moduli nella cache offline.
- `tests/workflows.test.mjs`, `tests/core.test.mjs`: regressioni dei flussi e dei dati.

## Compatibilità

Questa fase non modifica lo schema persistente: rimane la versione 2 del refactoring precedente, con chiave `ithaca:data` e lettura dei backup versione 1. Non introduce nuovi collegamenti tra record. Segna pagato usa i campi di pagamento già esistenti. Il service worker conserva nella cache anche i due nuovi moduli; nessun backend, login o dipendenza runtime aggiunta.

## Verifiche e limiti

- `npm test`: 23 test superati, inclusi migrazione e round-trip dei backup, costi senza duplicazioni, ricerca, viste derivate, quota storage, data contestuale, aggiunte consecutive, pagamento/annullamento e storia dei modal.
- `node --check`: tutti i moduli applicativi e il service worker validi; importazione dell'intero grafo del router riuscita.
- Service worker verificato in ambiente simulato: precache completo, moduli e navigazione disponibili senza richieste di rete, supporto a sottocartelle, conservazione delle cache di altre app.
- Prima del blocco degli strumenti browser erano stati verificati sul refactoring iniziale: viaggio con solo nome, hotel minimo e dettagli successivi, voli/attività derivati, spesa manuale, checklist, evidenza e personalizzazione; nessun errore console osservato. Verificato anche un viewport di 390 px senza overflow orizzontale nel caso osservato.
- Le ultime modifiche di questa fase NON hanno una verifica end-to-end finale nel browser: la ricarica è stata bloccata dalla verifica automatica delle autorizzazioni per limite d'uso. I test della storia dei modal simulano gli eventi; restano da confermare su dispositivo reale Indietro, tastiera, footer sticky e aggiornamento PWA/offline.
- Nessun risultato di test viene presentato come test utente reale o misurazione del tempo di compilazione.

## Scelte lasciate invariate

Creazione minima del viaggio, inserimento hotel/nota, campi avanzati, conferme di eliminazione, import/export e backup restano disponibili. Non aggiunti autosave, duplicazione record, relazioni fra note/spese/prenotazioni, tag, riordinamento configurabile della dashboard, cloud o automazioni: avrebbero aumentato la complessità senza essere necessari a questi percorsi.
