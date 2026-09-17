# Alan — cosa vuole?

App per due genitori: registrazione a tap di pappe, pannolini, nanne e "altro", registrazione del pianto con
impronta acustica, ipotesi sul perché piange (contesto + confronto con i pianti già spiegati), misura onesta di
quanto ci azzecca, sync tra i telefoni (diario, impostazioni e audio dei pianti).

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
   le policy, il realtime e il bucket privato `cries` per gli audio. Si può rieseguire senza danni (tutto è `if not exists`).
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
- **Home**: intestazione con nome, età e presenza dei genitori; tre timer (ultima pappa, sveglio/dorme da, ultimo cambio), pulsante "Piange", quattro riquadri: Pappa, Pannolino, Nanna, Altro.
- **Percorsi a tap**: Pappa → quanto preparato → quanto bevuto (ml precisi, da 0 al preparato). Pannolino → pipì → cacca. Nanna → un tap. Altro → ruttino, massaggio, ciuccio, coccole, passeggiata, bagnetto. Ogni percorso ha "quando": adesso / 15 / 30 / 60 min fa.
- **Piange**: registra fino a 30 s, calcola l'impronta acustica (tono, variazione, intensità, raffiche/pause, voce, timbro, andamento) e mostra le ipotesi in tempo reale. La prossima azione registrata entro 45 minuti spiega il pianto, da qualunque dei due telefoni.
- **Pianti**: precisione misurata a posteriori (solo contesto, solo suono, insieme, caso), elenco dei pianti con riascolto (▶ scarica l'audio registrato dall'altro telefono al primo tocco), cambio spiegazione.
- **Pattern**: 24 h, medie 7 giorni contro le norme per età, perché piangeva, contesto → causa, suono → causa.
- **Altro**: bandiere rosse pediatriche, **Diagnostica** (cosa è riuscito e cosa no nell'ultima registrazione, passo per passo, con "Condividi la diagnostica" per mandare il testo), account e sync, codice di riserva per unire i diari, impostazioni (nome e data di nascita, condivise tra i telefoni).
- **Aggiornamenti**: quando esce una versione nuova compare in alto il banner "Nuova versione, tocca per aggiornare", anche nell'app installata.

## Se l'audio non funziona
Altro → Diagnostica elenca i passi (microfono, motore audio, permesso, registratore, analisi, dati, impronta,
salvataggio, invio, scaricamento, riascolto) con ✓ o ✗ e il motivo. "Prova il microfono" chiede solo il permesso;
"Condividi la diagnostica" manda il testo via WhatsApp o negli appunti.
Su iPhone: il microfono nella PWA installata funziona da iOS 14.3 in poi; se il permesso è negato, Impostazioni →
Safari → Microfono, oppure apri l'app in Safari, concedi il permesso e reinstallala. L'audio è registrato in
`audio/mp4` su Safari e in `webm` su Chrome/Android; entrambi si riascoltano sull'altro telefono.

## Limiti noti
- Gli audio vanno nel bucket privato `cries` di Supabase Storage (1 GB gratis, circa 5.000 pianti; file fino a 10 MB) e si scaricano on-demand sull'altro telefono; se un upload fallisce, l'app riprova alla prossima rete o apertura.
- Il modello acustico è un k-NN su 12 feature: onesto e trasparente, non magico. La sezione "Quanto ci azzecca" dice se il suono aggiunge informazione rispetto al contesto. Se dopo 8 pianti non batte il caso, il suo peso va a zero da solo.
- Senza account gli audio restano sul telefono che li ha registrati; il codice di riserva non li porta.
- I conflitti (stessa voce modificata da entrambi) si risolvono con l'ora dell'ultima modifica, presa dall'orologio del telefono.
- Non è uno strumento diagnostico. Le bandiere rosse in "Altro" prevalgono sempre.

## Sviluppo
Nessuna build: modifica i file e ricarica. Vedi `CLAUDE.md` per convenzioni e `SPEC.md` per requisiti, motore e roadmap.

- Test: `sh tests/check.sh` (sintassi di tutti i js + le suite in `tests/*.test.js`, che girano in Node con uno stub DOM, senza browser).
- Release: alza `VERSION` in `sw.js`. È l'unico numero da cambiare: senza bump i telefoni restano sulla versione vecchia. Il nuovo worker si installa in attesa e la pagina mostra il banner di aggiornamento.
