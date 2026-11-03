# Alan — cosa vuole?

App per due genitori: registrazione a tap di pappe, cacca e "altro", crescita e salute, momenti di famiglia,
riepilogo per il pediatra, sync tra i telefoni (diario e impostazioni).

Dalla versione 33 l'app è ridotta all'essenziale: pappa (quando e quanto) e cacca (quando e quanta), due tap
l'una. Le funzioni su pianto e nanna sono state dismesse; le voci già registrate restano nell'archivio e si
sincronizzano come prima, semplicemente non si mostrano più.

Stack: HTML/CSS/JS senza build, PWA installabile da Safari/Chrome, dati locali in IndexedDB, sync opzionale su
Supabase (Postgres + Realtime + Storage + Auth con email e password). Tutto gratis ai volumi di una famiglia.

Online su https://fravazzani12-hub.github.io/Alan/ (GitHub Pages, branch `main`, cartella root).

## Messa online in 15 minuti

### 1. Repo e GitHub Pages (hosting della pagina)
1. I file stanno nella root del repo. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)` → Save.
2. Dopo un minuto l'app è su `https://<utente>.github.io/<repo>/`. Aprila dal telefono: già funziona in locale.

### 2. Supabase (database condiviso)
1. https://supabase.com → New project (piano Free, regione EU). Scegli una password del DB e conservala.
2. SQL Editor → New query → incolla tutto `supabase/schema.sql` → Run. Crea le tabelle `events` e `family_settings`,
   le policy, il realtime e il bucket privato `cries` (nome storico: oggi ci stanno le foto dei Momenti). Si può rieseguire senza danni (tutto è `if not exists`).
3. Authentication → Users → Add user → Create new user: email e password di Fabio, spunta **Auto Confirm User** → Create. Ripeti per Ilaria.
   Nessuna email viene inviata: il mailer integrato di Supabase non serve e non va configurato.
4. Settings → API Keys: copia **Project URL** e la chiave **anon** in `js/config.js`. Committa.
5. SQL Editor: esegui il blocco 6 in fondo a `supabase/schema.sql` (mette i due utenti nella stessa famiglia) e il blocco 7 con i vostri nomi ed email: è il nome che l'app mostra in alto e scrive su ogni voce ("chi ha registrato"). Senza, usa la parte dell'email prima della @.

### 3. Primo accesso
1. Sul telefono di Fabio: apri l'app → Altro → Account e sync → email e password → Accedi. "Famiglia: collegata".
2. Lo stesso sul telefono di Ilaria. Da qui ogni voce registrata compare sull'altro telefono in un secondo. In alto a destra
   c'è una pillola per genitore con il pallino verde se ha l'app aperta in quel momento; non c'è più nulla da selezionare,
   chi registra è chi ha fatto l'accesso.

### 4. Icona in Home
Safari → Condividi → "Aggiungi alla schermata Home". Da quel momento aprila sempre da lì (i dati locali vivono in quel browser).

## Cosa fa (in breve)
- **Home**: intestazione con nome, età e presenza dei genitori; due riquadri (ultima pappa, ultima cacca); la scheda **Prossime tappe** che mette insieme la previsione della pappa, i promemoria e la vitamina D di oggi; il rumore bianco; i pulsanti **Pappa**, **Cacca** e **Altro**; le ultime voci.
- **Pappa, una schermata**: quando (adesso / 15 / 30 / 60 min fa / altra ora) e quanto ha bevuto — le quantità che usate di solito con un tap, lo stepper ±5 ml per tutto il resto, e "Non ha bevuto niente". Due tap dal pulsante al salvataggio.
- **Cacca, una schermata**: quando e quanta (poca, normale, tanta).
- **Altro**: ruttino, rigurgito, massaggio pancia, ciuccio, coccole, passeggiata, bagnetto.
- **Pattern**: "La settimana di Alan" (pappe, latte e cacca al giorno, con l'andamento e la riga di oggi), poi **Pappa** con "Quando mangia" (ogni giorno sulle 24 ore, le pappe alte quanto i ml, la notte in ombra), "Le ore delle pappe" che dice a che ora mangia di solito e "Quanto beve"; poi **Cacca** (quante al giorno, per quantità). Tocca una barra per il dettaglio; solo numeri e mai giudizi.
- **Salute**: crescita con il grafico dei percentili OMS (peso e lunghezza) e il percentile di Alan, vitamina D con un tap e gli ultimi sette giorni, temperatura, visite e vaccini con "Nel calendario" (file .ics) e le tappe del calendario vaccinale suggerite in base all'età.
- **Svezzamento** (Salute, dai 4 mesi): registri ogni alimento provato in tre tap — cosa, quanto (assaggio/poco/tutto), com'è andata (bene/non gradito/reazione con nota) — e vedi quanti ne ha provati, gli ultimi assaggi e i suggeriti a gruppi. Un alimento nuovo alla volta, nessun calendario e nessun consiglio.
- **Previsione**: in Prossime tappe una riga dice quando aspettarsi la prossima pappa, imparando dal ritmo reale degli ultimi 7 giorni e, finché i dati sono pochi, dalla norma per età; in Pattern il riquadro "Ritmo di Alan" mostra l'intervallo fra le pappe contro la norma.
- **Promemoria**, dentro Prossime tappe e senza notifiche: visita oggi o domani con ora e luogo, pappa oltre l'atteso da più di 30 minuti, e la bandiera rossa della febbre sotto i 3 mesi. «Ok» nasconde una riga fino a domani; gli interruttori sono in Altro → Promemoria.
- **Ultime voci e modifica**: il diario è raggruppato per giornata (Oggi, Ieri, poi la data) con l'ora, un pallino del colore del tipo e chi ha registrato. Tocca una voce e la correggi: giorno e ora, quanto ha bevuto, quanta cacca, temperatura, misure, e una **nota** (come stava, cosa hai notato). Da lì si elimina anche. Le correzioni si vedono sull'altro telefono. Sotto le ultime voci, "Tutto il diario" apre il diario completo giorno per giorno. In Salute la scheda "Note" le elenca tutte; il riepilogo per il pediatra le riporta.
- **Momenti**, la tab di famiglia: le prime volte con l'età a cui sono successe, l'album di foto condiviso tra i due telefoni, i momenti raccontati in due parole, la settimana in numeri e una lettera per ciascun genitore.
- **Per il pediatra** (Altro): un riepilogo di 7, 30 o 90 giorni con misure e percentili OMS, pappe, cacca, temperature, medicine, visite e note, da stampare o salvare in PDF dal telefono o da mandare come testo.
- **Rumore bianco** (Home): il suono per la nanna generato dal telefono, senza YouTube e senza rete. "Ventilatore" ricalca lo spettro del video che usavate, poi Ventilatore scuro, Ventilatore chiaro, Rosa e Marrone; loop senza stacchi, volume in 5 livelli, spegnimento dopo 30 min, 1, 2 o 8 ore. Telefono lontano dalla culla e volume basso, come indica l'American Academy of Pediatrics.
- **Altro**: bandiere rosse pediatriche, **Diagnostica** (versione, archivio, sync e spazio, con "Condividi la diagnostica"), account e sync, codice di riserva per unire i diari, impostazioni (tema; nome, data di nascita e intervallo tra le pappe, condivisi tra i telefoni).
- **Aggiornamenti**: quando esce una versione nuova compare in alto il banner "Nuova versione, tocca per aggiornare", anche nell'app installata.

## Limiti noti
- Le foto dei Momenti vanno nel bucket privato `cries` di Supabase Storage (1 GB gratis) e si scaricano on-demand sull'altro telefono; se un upload fallisce, l'app riprova alla prossima rete o apertura.
- I conflitti (stessa voce modificata da entrambi) si risolvono con l'ora dell'ultima modifica, presa dall'orologio del telefono.
- Le voci dei tipi dismessi (pianti, nanne) restano nel database e nel backup, ma l'app non le mostra più.
- Non è uno strumento diagnostico. Le bandiere rosse in "Altro" prevalgono sempre.

## Sviluppo
Nessuna build: modifica i file e ricarica. Vedi `CLAUDE.md` per convenzioni e `SPEC.md` per requisiti, motore e roadmap.

- Test: `sh tests/check.sh` (sintassi di tutti i js + le suite in `tests/*.test.js`, che girano in Node con uno stub DOM, senza browser).
- Release: alza `VERSION` in `sw.js`. È l'unico numero da cambiare: senza bump i telefoni restano sulla versione vecchia. Il nuovo worker si installa in attesa e la pagina mostra il banner di aggiornamento.
- Estensioni: una funzione nuova vive in `js/<nome>.js` e si registra su `window.AlanExt` (percorsi a tap, blocchi Home, tab, riquadri in Pattern/Salute/Altro, descrizioni e decorazioni delle righe del diario, hook `change`; l'API è in `js/app.js`, sezione estensioni) senza toccare `app.js`. Si carica con un `<script>` in `index.html` dopo `app.js`, ha il suo blocco CSS `/* == nome == */` in `css/app.css`, il suo paragrafo in `SPEC.md` §8 e la sua suite `tests/<nome>.test.js`, che la carica con `boot({ext:['<nome>']})`.
