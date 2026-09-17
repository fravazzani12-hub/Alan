# CLAUDE.md — istruzioni per Claude Code

Progetto: PWA "Alan — cosa vuole?" (diario neonato + analisi del pianto + sync). Committente: Fabio. Lingua UI: italiano.
Online su https://fravazzani12-hub.github.io/Alan/ (GitHub Pages dalla root del repo, branch `main`).

## Stack e vincoli
- HTML/CSS/JS vanilla, **nessuna build**, nessun framework, nessun bundler. Tutto deve aprirsi da file statici su GitHub Pages.
- ES5-style (function, var) nel codice app: gira anche su Safari vecchiotti. Niente moduli ESM, niente TypeScript.
- Dipendenze esterne solo via CDN già presenti in index.html (supabase-js 2.49.4 UMD, fissato; Google Fonts). Non aggiungerne senza motivo.
- Dati locali: IndexedDB (`js/app.js`, funzioni idbGet/idbPut/idbDel) con mirror localStorage. Non cambiare le chiavi (`alan-v2`, `alan.v2`) senza migrazione. L'audio sta nello store `audio` come `{buf,mime}`; `audioGet` legge anche i vecchi Blob.
- Chi registra (`who`) è il nome del profilo dell'utente loggato (`AlanSync.status().name`), mai un selettore in UI; l'audio remoto è `e.audioPath` (percorso completo nel bucket), `e.audio` resta locale.
- Sync: `js/sync.js` (Supabase). Ogni mutazione locale passa da `touched(e)` / `removed(e)` in app.js; le modifiche remote entrano da `mergeRemote(list)` e `mergeRemoteSettings(row)`. Mantieni questo contratto. Timestamp sempre ISO UTC con millisecondi (`_updated`).
- Segreti: nessuno nel repo. `js/config.js` contiene solo URL e chiave anon (pubblica); la sicurezza è nelle policy RLS di `supabase/schema.sql` (tabelle e bucket `cries`).

## Struttura
- `index.html` markup; `css/app.css` stile (token in :root, dark via prefers-color-scheme); `js/app.js` UI + motore + audio + diagnostica + salute + aggiornamenti; `js/who.js` solo dati (LMS OMS maschi, non modificare a mano); `js/sync.js` sync; `sw.js` cache shell + aggiornamento con banner (a ogni release alza `VERSION` in sw.js, è l'unico numero da toccare: senza bump i telefoni restano sulla versione vecchia; niente `?v=` sugli asset); `supabase/schema.sql` schema (rieseguibile).
- Estensioni: js/timer.js, predict.js, reminders.js, stats.js, report.js, svezzamento.js, momenti.js, note.js, noise.js si registrano su window.AlanExt (API in app.js, sezione estensioni) e non toccano app.js; ogni estensione ha la sua suite tests/<nome>.test.js e il suo blocco CSS delimitato in css/app.css.
- `SPEC.md` è la fonte di verità su requisiti, dati, motore, sync e aggiornamenti: aggiornalo quando cambi formule, dati o flussi.

## Regole di lavoro
- Prima di toccare il motore (norme, modello, k-NN, fusione, precisione LOO) leggi SPEC.md §4 e mantieni la misura "Quanto ci azzecca": qualsiasi cambio al modello deve poter essere valutato lì.
- Prima di toccare registrazione o riascolto leggi SPEC.md §4.4 (vincoli iOS): AudioContext nel tap, MediaRecorder senza timeslice, `{buf,mime}` in IndexedDB, sblocco dell'elemento audio nel tap. Ogni passo scrive in `diag()`: se aggiungi un passo, aggiungilo a `DIAG_STEPS`.
- UI: solo tap, target ≥ 44 px, un'idea per schermata, nessuna tastiera se non per i ml e l'accesso. Non introdurre form lunghi. I pulsanti che aspettano la rete usano `busy(btn, on, label)`.
- Salute: il percentile è un calcolo sulle tabelle OMS, mai un giudizio ("va bene", "è poco"); le tappe vaccinali sono suggerimenti, le date le fissano ASL e pediatra. Non aggiungere soglie o consigli clinici oltre alle bandiere rosse esistenti.
- Non scrivere copy diagnostico. Le bandiere rosse in "Altro" sono testo fisso: non ammorbidirle, non ampliarle senza fonte pediatrica.
- Test: `sh tests/check.sh` (sintassi + `tests/*.test.js` in Node con lo stub DOM di `tests/stub.js`). Estendi le suite invece di testare a mano; ogni suite deve restare eseguibile con `node tests/<nome>.test.js`.
- Commit piccoli, messaggi in italiano. Non committare audio o dati reali.
