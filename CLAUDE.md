# CLAUDE.md — istruzioni per Claude Code

Progetto: PWA "Alan — cosa vuole?" (diario neonato + analisi del pianto + sync). Committente: Fabio. Lingua UI: italiano.

## Stack e vincoli
- HTML/CSS/JS vanilla, **nessuna build**, nessun framework, nessun bundler. Tutto deve aprirsi da file statici su GitHub Pages.
- ES5-style (function, var) nel codice app: gira anche su Safari vecchiotti. Niente moduli ESM, niente TypeScript.
- Dipendenze esterne solo via CDN già presenti in index.html (supabase-js UMD, Google Fonts). Non aggiungerne senza motivo.
- Dati locali: IndexedDB (`js/app.js`, funzioni idbGet/idbPut/idbDel) con mirror localStorage. Non cambiare le chiavi (`alan-v2`, `alan.v2`) senza migrazione.
- Sync: `js/sync.js` (Supabase). Ogni mutazione locale passa da `touched(e)` / `removed(e)` in app.js; le modifiche remote entrano da `mergeRemote(list)`. Mantieni questo contratto.
- Segreti: nessuno nel repo. `js/config.js` contiene solo URL e chiave anon (pubblica); la sicurezza è nelle policy RLS di `supabase/schema.sql`.

## Struttura
- `index.html` markup; `css/app.css` stile (token in :root, dark via prefers-color-scheme); `js/app.js` UI + motore + audio; `js/sync.js` sync; `sw.js` cache shell + aggiornamento con banner (a ogni release alza `VERSION` in sw.js, è l'unico numero da toccare: senza bump i telefoni restano sulla versione vecchia; niente `?v=` sugli asset); `supabase/schema.sql` schema.
- `SPEC.md` è la fonte di verità su requisiti e motore: aggiornalo quando cambi formule, dati o flussi.

## Regole di lavoro
- Prima di toccare il motore (norme, modello, k-NN, fusione, precisione LOO) leggi SPEC.md §4 e mantieni la misura "Quanto ci azzecca": qualsiasi cambio al modello deve poter essere valutato lì.
- UI: solo tap, target ≥ 44 px, un'idea per schermata, nessuna tastiera se non per i ml. Non introdurre form lunghi.
- Non scrivere copy diagnostico. Le bandiere rosse in "Altro" sono testo fisso: non ammorbidirle, non ampliarle senza fonte pediatrica.
- Test rapido: `node --check js/app.js js/sync.js sw.js`. Per il motore esiste un harness a stub DOM (vedi `tests/`); estendilo invece di testare a mano.
- Commit piccoli, messaggi in italiano. Non committare audio o dati reali.
