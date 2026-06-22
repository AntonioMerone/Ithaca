# Deploy GitHub Pages

Guida rapida per pubblicare Ithaca come release privata su GitHub Pages.

## Preparazione

1. Verifica che `index.html`, `manifest.json` e `service-worker.js` usino path relativi.
2. Verifica che `manifest.json` contenga `start_url: "./index.html#/home"` e `scope: "./"`.
3. Verifica che la cache del service worker sia `ithaca-shell-v19-2`.
4. Esporta un backup JSON se nel browser locale ci sono dati importanti.

## Pubblicazione

1. Crea o usa un repository GitHub chiamato `Ithaca`.
2. Carica i file dell'app nella root del repository.
3. Apri `GitHub -> Settings -> Pages`.
4. In `Build and deployment`, scegli `Deploy from a branch`.
5. Seleziona il branch `main`.
6. Seleziona la cartella `/root`.
7. Salva e attendi la pubblicazione.

L'app sara raggiungibile a un URL simile a:

```text
https://USERNAME.github.io/Ithaca/
```

Le rotte interne restano hash route, per esempio:

```text
https://USERNAME.github.io/Ithaca/#/home
https://USERNAME.github.io/Ithaca/#/trip/TRIP_ID
```

## Dati locali

Ithaca salva i dati in `localStorage` con chiave `ithaca:data`. I dati restano legati al browser, al dispositivo e al dominio GitHub Pages usato.

Non c'e sincronizzazione automatica tra dispositivi. Per spostare i dati, usa Esporta backup JSON e poi Importa backup JSON sull'altro browser.

## Installazione Android Chrome

1. Apri l'URL GitHub Pages in Chrome.
2. Apri il menu del browser.
3. Tocca `Installa app` o `Aggiungi a schermata Home`.
4. Apri Ithaca dall'icona installata.

## Installazione iPhone Safari

1. Apri l'URL GitHub Pages in Safari.
2. Tocca Condividi.
3. Scegli `Aggiungi alla schermata Home`.
4. Conferma il nome e apri Ithaca dall'icona.

Su iOS alcune funzioni PWA possono comportarsi diversamente rispetto ad Android. Testare sempre su dispositivo reale.

## Controlli consigliati

- Chrome DevTools -> Lighthouse: controlla Performance.
- Chrome DevTools -> Lighthouse: controlla Accessibility.
- Chrome DevTools -> Lighthouse: controlla Best Practices.
- Chrome DevTools -> Lighthouse: controlla PWA/installability.
- Chrome DevTools -> Application -> Manifest: verifica nome, icone, `start_url` e `scope`.
- Chrome DevTools -> Application -> Service Workers: verifica registrazione e stato.
- Chrome DevTools -> Application -> Cache Storage: verifica la cache `ithaca-shell-v19-2`.
- Test offline: carica l'app una volta, poi prova a riaprirla senza rete.
- Test dati: crea un viaggio, aggiorna una sezione, ricarica la pagina e verifica che i dati restino presenti.
- Test backup: esporta, resetta, importa e controlla che i dati tornino corretti.
