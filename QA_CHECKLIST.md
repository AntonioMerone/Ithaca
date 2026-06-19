# Ithaca QA Checklist

Checklist manuale per la prima release PWA di Ithaca.

## Home

- [ ] La Home si carica su `#/home` senza errori console.
- [ ] Empty state visibile quando non ci sono viaggi.
- [ ] Creazione viaggio funzionante con campi obbligatori.
- [ ] Modifica viaggio funzionante.
- [ ] Eliminazione viaggio con conferma.
- [ ] Click su una card apre la dashboard del viaggio.
- [ ] La modal Gestione dati si apre dalla Home.

## Dashboard

- [ ] Viaggio futuro: countdown e messaggi coerenti.
- [ ] Viaggio che parte oggi: stato "Parte oggi".
- [ ] Viaggio in corso: stato e prossime azioni coerenti.
- [ ] Viaggio concluso: stato "Concluso".
- [ ] Widget Budget aggiornato con dati reali.
- [ ] Widget Timeline mostra la prossima attivita.
- [ ] Widget Checklist mostra completati/totale.
- [ ] Widget Note mostra ultima nota e destinazioni.
- [ ] Prossime azioni coerenti con checklist o stato viaggio.
- [ ] Quick actions portano alle sezioni corrette.

## Budget

- [ ] Aggiunta spesa funzionante.
- [ ] Modifica spesa funzionante.
- [ ] Eliminazione spesa con conferma.
- [ ] Filtro stato: tutte/pagate/da pagare.
- [ ] Filtro categoria funzionante.
- [ ] Sforamento budget evidenziato.
- [ ] Dati presenti dopo refresh.

## Timeline

- [ ] Aggiunta tappa funzionante.
- [ ] Modifica tappa funzionante.
- [ ] Eliminazione tappa con conferma.
- [ ] Ordinamento per data e ora corretto.
- [ ] Raggruppamento per giorno corretto.
- [ ] Warning data fuori range visibile.
- [ ] Filtro tipo funzionante.
- [ ] Dati presenti dopo refresh.

## Checklist

- [ ] Aggiunta task funzionante.
- [ ] Modifica task funzionante.
- [ ] Eliminazione task con conferma.
- [ ] Toggle completato/non completato funzionante.
- [ ] Template base caricato correttamente.
- [ ] Template non crea duplicati titolo+sezione.
- [ ] Badge overdue visibile per task scaduti.
- [ ] Filtri tutti/da fare/completati funzionanti.
- [ ] Dati presenti dopo refresh.

## Note

- [ ] Aggiunta nota funzionante.
- [ ] Modifica nota funzionante.
- [ ] Eliminazione nota con conferma.
- [ ] Ricerca su titolo, destinazione e contenuto.
- [ ] Filtro destinazione funzionante.
- [ ] Empty state senza note visibile.
- [ ] Dati presenti dopo refresh.

## Backup

- [ ] Export JSON scarica `ithaca-backup-YYYY-MM-DD.json`.
- [ ] Il backup contiene `app`, `version`, `exportedAt`, `data`.
- [ ] Import JSON valido sostituisce i dati dopo conferma.
- [ ] Import JSON non valido mostra errore senza crash.
- [ ] Reset dati app chiede conferma forte.
- [ ] Migrazione da `odysseus:data` a `ithaca:data` preserva i dati.
- [ ] JSON corrotto non rompe l'app e crea backup di sicurezza.

## PWA

- [ ] Manifest valido e raggiungibile.
- [ ] Service worker registrato.
- [ ] Cache aggiornata a `ithaca-shell-v14-4`.
- [ ] App caricabile offline dopo primo caricamento.
- [ ] Icone manifest 192x192 e 512x512 presenti.
- [ ] Favicon presente.
- [ ] Installabilita disponibile su localhost o HTTPS.

## Release privata GitHub Pages

- [ ] App pubblicata da GitHub Pages sulla cartella corretta.
- [ ] URL GitHub Pages aperto da desktop.
- [ ] URL GitHub Pages aperto da smartphone Android.
- [ ] URL GitHub Pages aperto da iPhone/Safari.
- [ ] `index.html` usa path relativi per CSS, JS, manifest e icone.
- [ ] `manifest.json` usa `start_url` e `scope` relativi.
- [ ] Il service worker usa cache `ithaca-shell-v14-4`.
- [ ] Il service worker registra `./service-worker.js`.
- [ ] La Home si apre da `https://USERNAME.github.io/Ithaca/#/home`.
- [ ] Una pagina viaggio si apre da hash route senza 404 server.
- [ ] La dashboard viaggio resta navigabile dopo refresh.
- [ ] Installazione PWA Android.
- [ ] Aggiunta a Home iPhone.
- [ ] Creazione viaggio su smartphone.
- [ ] Aggiunta spesa su smartphone.
- [ ] Aggiunta tappa su smartphone.
- [ ] Aggiunta task su smartphone.
- [ ] Aggiunta nota su smartphone.
- [ ] Dati locali preservati dopo refresh.
- [ ] Export JSON su desktop.
- [ ] Import JSON su desktop.
- [ ] Reset dati con conferma.
- [ ] Test offline dopo primo caricamento.
- [ ] Nessun errore console desktop.
- [ ] Nessun overflow mobile evidente.
- [ ] Nessuna logica di update prompt o `skipWaiting` aggiunta al service worker.

## Responsive e accessibilita

- [ ] Mobile 375px senza overflow orizzontale.
- [ ] Mobile 430px senza overflow orizzontale.
- [ ] Tablet leggibile.
- [ ] Desktop centrato e non troppo largo.
- [ ] Bottom nav non copre contenuti principali.
- [ ] Focus visibile su bottoni, link e input.
- [ ] Label associate agli input principali.
- [ ] Modal chiudibile da pulsante, backdrop ed Escape.
