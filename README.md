# Alan — cosa vuole?

App per due genitori: registrazione a tap di pappe, pannolini, nanne e "altro", registrazione del pianto con
impronta acustica, ipotesi sul perché piange (contesto + confronto con i pianti già spiegati), misura onesta di
quanto ci azzecca, sync tra i telefoni.

Stack: HTML/CSS/JS senza build, PWA installabile da Safari/Chrome, dati locali in IndexedDB, sync opzionale su
Supabase (Postgres + Realtime + Auth via codice email). Tutto gratis ai volumi di una famiglia.

## Messa online in 15 minuti

### 1. Repo e GitHub Pages (hosting della pagina)
1. Crea un repo GitHub (anche privato va bene, Pages funziona lo stesso) e carica questi file nella root.
2. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)` → Save.
3. Dopo un minuto l'app è su `https://<utente>.github.io/<repo>/`. Aprila dal telefono: già funziona in locale.

### 2. Supabase (database condiviso)
1. https://supabase.com → New project (piano Free, regione EU). Scegli una password del DB e conservala.
2. SQL Editor → New query → incolla `supabase/schema.sql` → Run.
3. Authentication → Users → Add user → Create new user: email e password di Fabio, spunta **Auto Confirm User** → Create. Ripeti per Ilaria.
   Nessuna email viene inviata: il mailer integrato di Supabase non serve e non va configurato.
4. Settings → API Keys: copia **Project URL** e la chiave **anon** (o publishable) in `js/config.js`. Committa.
5. SQL Editor: esegui il blocco 5 in fondo a `supabase/schema.sql` (mette i due utenti nella stessa famiglia) e il blocco 7 con i vostri nomi ed email (è il nome che l'app mostra per chi è loggato).

### 3. Primo accesso
1. Sul telefono di Fabio: apri l'app → Altro → Account e sync → email e password → Accedi. "Famiglia: collegata".
2. Lo stesso sul telefono di Ilaria. Da qui ogni voce registrata compare sull'altro telefono in un secondo.

### 4. Icona in Home
Safari → Condividi → "Aggiungi alla schermata Home". Da quel momento aprila sempre da lì (i dati locali vivono in quel browser).

## Cosa fa (in breve)
- **Home**: tre timer (ultima pappa, sveglio/dorme da, ultimo cambio), pulsante "Piange", quattro riquadri: Pappa, Pannolino, Nanna, Altro.
- **Percorsi a tap**: Pappa → quanto preparato → quanto bevuto (ml precisi, da 0 al preparato). Pannolino → pipì → cacca. Nanna → un tap. Altro → ruttino, massaggio, ciuccio, coccole, passeggiata, bagnetto. Ogni percorso ha "quando": adesso / 15 / 30 / 60 min fa.
- **Piange**: registra fino a 30 s, calcola l'impronta acustica (tono, variazione, intensità, raffiche/pause, voce, timbro, andamento) e mostra le ipotesi in tempo reale. La prossima azione registrata entro 45 minuti spiega il pianto.
- **Pianti**: precisione misurata a posteriori (solo contesto, solo suono, insieme, caso), elenco dei pianti con riascolto, cambio spiegazione.
- **Pattern**: 24 h, medie 7 giorni contro le norme per età, perché piangeva, contesto → causa, suono → causa.
- **Altro**: bandiere rosse pediatriche, account e sync, codice di riserva per unire i diari, impostazioni.

## Limiti noti
- Gli **audio** vengono caricati nel bucket privato `cries` di Supabase Storage (1 GB gratis, circa 5.000 pianti) e scaricati on-demand sull'altro telefono; se un upload fallisce, l'app riprova alla prossima apertura.
- iOS: il microfono nella PWA installata funziona da iOS 14.3 in poi; se al primo pianto non chiede il permesso, prova ad aprire l'app in Safari e poi reinstallarla.
- Il modello acustico è un k-NN su 12 feature: onesto e trasparente, non magico. La sezione "Quanto ci azzecca" dice se il suono aggiunge informazione rispetto al contesto. Se dopo 8 pianti non batte il caso, il suo peso va a zero da solo.
- Non è uno strumento diagnostico. Le bandiere rosse in "Altro" prevalgono sempre.

## Sviluppo
Nessuna build: modifica i file e ricarica. Vedi `CLAUDE.md` per convenzioni e `SPEC.md` per requisiti, motore e roadmap.
