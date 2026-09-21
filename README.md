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
- **Home**: intestazione con nome, età e presenza dei genitori; tre timer (ultima pappa, sveglio/dorme da, ultimo cambio); la scheda **Prossime tappe** che mette insieme previsioni, promemoria e vitamina D di oggi; il riepilogo della notte; pulsante "Piange" e quattro riquadri: Pappa, Pannolino, Nanna, Altro.
- **Percorsi a tap**: Pappa → quanto preparato → quanto bevuto (ml precisi, da 0 al preparato) con la durata in un tap (5, 10, 15, 20, 30, 45 min), anche senza cronometro. Pannolino → pipì (poca/normale/tanta o no) → cacca (idem). Nanna → un tap. Altro → ruttino, rigurgito, massaggio, ciuccio, coccole, passeggiata, bagnetto. Ogni percorso ha "quando": adesso / 15 / 30 / 60 min fa / "altra ora" con l'orario preciso; nella Pappa anche l'ora di fine, così la durata resta.
- **Ascolto del pianto** (Altro → Ascolto, acceso solo sul dispositivo che vuoi): lasci l'app aperta su un iPad nella stanza e lui sente i pianti e li segna da solo, con ora, durata e tono. Serve a sapere quante volte piange senza dover pensare a far partire una registrazione. Non salva nessun audio. Funziona solo con l'app in primo piano e lo schermo acceso (il permesso al microfono si dà una volta per apertura); dal telefono poi spieghi tu il perché.
- **Piange**: registra fino a 30 s, calcola l'impronta acustica (tono, variazione, intensità, raffiche/pause, voce, timbro, andamento) e mostra le ipotesi in tempo reale. La prossima azione registrata entro 45 minuti spiega il pianto, da qualunque dei due telefoni.
- **Pianti**: precisione misurata a posteriori (solo contesto, solo suono, insieme, caso), elenco dei pianti con riascolto (▶ scarica l'audio registrato dall'altro telefono al primo tocco), cambio spiegazione.
- **Pattern**: 24 h, medie 7 giorni contro le norme per età, perché piangeva, contesto → causa, suono → causa.
- **Diario notturno** (Pattern): le ultime notti restano consultabili anche dopo la mattina. Una riga per notte con quanto ha dormito, pappe, cambi e pianti; toccala e si apre il racconto di quella notte con tutte le voci, modificabili.
- **Pattern**: si apre con "La settimana di Alan" (pappe, sonno di notte, cambi, pianti: media, andamento e la riga di oggi), poi **Pappa** con "Quando mangia" (ogni giorno sulle 24 ore, le pappe alte quanto i ml, le nanne come fasce, la notte in ombra), "Le ore delle pappe" che dice a che ora mangia di solito e "Quanto beve"; poi **Nanna** (sonno per notte 22–7) e **Pannolini** (pipì e cacca al giorno, per quantità). In fondo "Perché piangeva", con le tabelle di dettaglio a scomparsa. Tocca una barra per il dettaglio; solo numeri e mai giudizi.
- **Salute**: crescita con il grafico dei percentili OMS (peso e lunghezza) e il percentile di Alan, vitamina D con un tap e gli ultimi sette giorni, temperatura, visite e vaccini con "Nel calendario" (file .ics, si apre in Calendario) e le tappe del calendario vaccinale suggerite in base all'età.
- **Svezzamento** (Salute, dai 4 mesi): registri ogni alimento provato in tre tap — cosa, quanto (assaggio/poco/tutto), com'è andata (bene/non gradito/reazione con nota) — e vedi quanti ne ha provati, gli ultimi assaggi e i suggeriti a gruppi che spariscono man mano che li prova. Un alimento nuovo alla volta, nessun calendario e nessun consiglio.
- **Com'è andata stanotte**: la mattina, sotto le prossime tappe, un riquadro da toccare. Si apre con il racconto della notte in poche frasi (quanto ha dormito e il tratto più lungo, risvegli, pappe e ml, cambi, pianti con le cause, chi si è alzato), i numeri e l'elenco delle voci. È per chi la notte non l'ha vissuta.
- **Cronometro** in Home per la pappa: riparte dal tempo giusto anche dopo aver chiuso l'app; a fine pappa si passa ai ml e la voce si salva con la durata. In Pattern, "Quanto dura la pappa": media, più corta e più lunga, ml al minuto.
- **Previsioni**: in Prossime tappe due righe dicono quando aspettarsi la prossima nanna (o il risveglio, se dorme) e la prossima pappa, imparando dal ritmo reale degli ultimi 7 giorni e, finché i dati sono pochi, dalla norma per età; in Pattern il riquadro "Ritmo di Alan" mostra veglia e intervallo pappe contro la norma.
- **Promemoria**, dentro Prossime tappe e senza notifiche: visita oggi o domani con ora e luogo, pappa oltre l'atteso da più di 30 minuti, e la bandiera rossa della febbre sotto i 3 mesi. «Ok» nasconde una riga fino a domani; gli interruttori sono in Altro → Promemoria.
- **Altro**: bandiere rosse pediatriche, **Diagnostica** (cosa è riuscito e cosa no nell'ultima registrazione, passo per passo, con "Condividi la diagnostica" per mandare il testo), account e sync, codice di riserva per unire i diari, impostazioni (tema chiaro/scuro/automatico; nome, data di nascita e intervallo tra le pappe, condivisi tra i telefoni).
- **Per il pediatra** (Altro): un riepilogo di 7, 30 o 90 giorni con misure e percentili OMS, pappe, sonno, cambi, pianti con le cause in %, temperature, medicine e visite, da stampare o salvare in PDF dal telefono o da mandare come testo.
- **Rumore bianco** (Home, sopra "Piange"): il suono per la nanna generato dal telefono, senza YouTube e senza rete. "Ventilatore" ricalca lo spettro del video che usavate (misurato da una vostra registrazione), poi Ventilatore scuro, Ventilatore chiaro, Rosa e Marrone; loop senza stacchi, cambi di suono e volume in dissolvenza; volume in 5 livelli (il 4 è quello del video a parità di volume del telefono), spegnimento dopo 30 min, 1, 2 o 8 ore, controlli sulla schermata di blocco. Telefono lontano dalla culla e volume basso, come indica l'American Academy of Pediatrics.
- **Ultime voci e modifica**: il diario è raggruppato per giornata (Oggi, Ieri, poi la data) con l'ora, un pallino del colore del tipo e chi ha registrato. Tocca una voce e la correggi: giorno e ora, quanto ha bevuto, pipì e cacca, temperatura, misure, e una **nota** (come stava, cosa hai notato). Da lì si elimina anche. Le correzioni si vedono sull'altro telefono. Sotto le ultime voci, "Tutto il diario" apre il diario completo giorno per giorno: tocca una voce, anche di giorni fa, per correggerla o annotarla. In Salute la scheda "Note" le elenca tutte; il riepilogo per il pediatra le riporta.
- **Momenti**, la tab di famiglia: le prime volte con l'età a cui sono successe, l'album di foto condiviso tra i due telefoni (ridimensionate e caricate nel vostro spazio), i momenti raccontati in due parole, la settimana in numeri e una lettera per ciascun genitore su cosa vorrebbe ricordare.
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
- Estensioni: una funzione nuova vive in `js/<nome>.js` e si registra su `window.AlanExt` (percorsi a tap, blocchi Home, tab, riquadri in Pattern/Salute/Altro, descrizioni e decorazioni delle righe del diario, hook `change`; l'API è in `js/app.js`, sezione estensioni) senza toccare `app.js`. Si carica con un `<script>` in `index.html` dopo `app.js`, ha il suo blocco CSS `/* == nome == */` in `css/app.css`, il suo paragrafo in `SPEC.md` §9 e la sua suite `tests/<nome>.test.js`, che la carica con `boot({ext:['<nome>']})`.
