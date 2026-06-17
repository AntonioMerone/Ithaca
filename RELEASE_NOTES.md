# Ithaca MVP 1.0.0

Prima release privata installabile come PWA.

## Include

- Shell PWA mobile-first in HTML, CSS e JavaScript vanilla.
- Rotte hash per Home, dashboard viaggio, timeline, budget, checklist e note.
- CRUD locale per viaggi, budget, timeline, checklist e note.
- Persistenza locale tramite `localStorage`.
- Migrazione da `odysseus:data` a `ithaca:data`.
- Backup JSON con export, import e reset dati app.
- UI rifinita per uso mobile-first.
- Manifest, icone, favicon e service worker base per cache della shell.
- Compatibilita con pubblicazione in sottocartella GitHub Pages.

## Non include

- Backend.
- Login o account.
- Sincronizzazione cloud.
- IndexedDB.
- AI.
- Documenti o prenotazioni.
- Collaborazione multiutente.

## Limiti noti

- I dati sono salvati solo nel browser del dispositivo.
- La cancellazione dei dati del sito puo eliminare i viaggi salvati.
- Non c'e sincronizzazione automatica tra dispositivi.
- L'offline dipende dal primo caricamento corretto della PWA e dalla cache del browser.
- Su iOS il comportamento PWA puo variare in base alla versione di Safari.

## Backup JSON

Prima di prove distruttive, cambi dispositivo o pulizie del browser, esporta un backup JSON dalla Home. Il backup puo essere importato in un altro browser o ripristinato dopo un reset.

## Aggiornamenti PWA

Dopo una nuova release, potrebbe essere necessario ricaricare manualmente la pagina o svuotare la cache del browser per vedere subito l'ultima versione.

## Evoluzioni future

Possibili fasi successive: documenti, prenotazioni, mappe, template avanzati, sincronizzazione opzionale e funzionalita AI. Queste funzioni non fanno parte della release MVP 1.0.0.
