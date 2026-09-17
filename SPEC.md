# SPEC — Alan, cosa vuole?

Requisiti dichiarati dal committente (Fabio), scelte fatte, e come funziona il motore. Questo file è la fonte di verità
per chi sviluppa (umano o Claude Code).

## 1. Requisiti
1. Inserimento **solo a tap**: nessun valore da digitare. I ml preparati si scelgono tra valori fissi o con stepper ±10; i ml bevuti si scelgono tra i valori da 0 a prep a passi di 10 (quantità precise, mai "poco"/"metà").
2. Home = scelta di cosa registrare (Pappa, Pannolino, Nanna, Altro) → domande una alla volta, ogni tap avanza, l'ultimo tap salva.
3. **Registrare il pianto di ogni azione**: prima di addormentarsi, prima di mangiare, ecc. L'app deve ricordare gli audio e
   ricollegare quello che sta ascoltando alle informazioni che ha per dare un giudizio.
4. Due genitori (Fabio e Ilaria) con i dati allineati tra i telefoni: diario, impostazioni e audio dei pianti.
5. Onestà sul risultato: l'app deve misurare da sola quanto ci azzecca, non fingere di tradurre.
6. I problemi (in particolare sull'audio) devono essere leggibili dal telefono, senza strumenti da sviluppatore.

## 2. Modello dati (evento = oggetto piatto, `id` client-side, `t` epoch ms, `k` tipo, `who` chi ha registrato, `_updated` ISO UTC dell'ultima modifica)
`who` = nome dal profilo dell'utente loggato (`user_metadata.name`, blocco 7 dello schema; altrimenti la parte locale dell'email), non selezionabile; senza account resta "Io".
| k | campi | note |
|---|---|---|
| feed | prep (ml preparati), ml (ml bevuti, scelti a tap a passi di 10, 0 ≤ ml ≤ prep; 0 = biberon rifiutato) | una pappa con ml = 0 non conta come ultima pappa, non entra nel tipico e non etichetta un pianto |
| feed (dal cronometro, `js/timer.js`) | src ('biberon'), dur (s) | `t` = inizio della pappa; `ml`/`prep` come sempre |
| food | name (≤ 40 caratteri, spazi normalizzati), group (cereali/verdure/frutta/proteine/latticini, `altro` per i nomi scritti a mano), amount (assaggio/poco/tutto), reaction (bene/nongradito/reazione), note (≤ 120 caratteri, solo con `reaction = reazione`, altrimenti '') | `js/svezzamento.js`; alimenti distinti per nome normalizzato (minuscolo, spazi collassati); nel diario `Nome · quanto · com'è andata [· nota]` |
| moment | kind ('first'/'photo'/'story'); prima volta: code, title (15 tappe fisse); foto/racconto: text (≤ 80), photo (bool: esiste una foto), photoPath (`<family_id>/<id>.<ext>` nel bucket `cries`), mime | `js/momenti.js`; nascosto dal diario di Home; prima volta con `t` = adesso se il giorno è oggi, altrimenti mezzogiorno del giorno scelto; la foto sta in IndexedDB store `files` come `{buf,mime}` |
| letter | text (≤ 4000) | `js/momenti.js`; `t` = adesso, `who` = chi scrive; nascosto dal diario |
| diaper | pipi (no/poca/normale/tanta), cacca (no/poca/normale/tanta) | il valore `si` della v12 si legge come normale (`lvlKey`); conta come "con pipì/cacca" tutto ciò che non è `no` |
| sleep / wake | — | stato sonno = ultimo dei due |
| (ogni voce del diario) | note (testo ≤ 200), noteBy (chi l'ha scritta) | `js/note.js`; campi opzionali su qualunque voce tranne appt e le voci nascoste; viaggiano nel `data` jsonb con la voce (LWW sull'intera voce) |
| other | what (ruttino/rigurgito/massaggio/ciuccio/coccole/passeggiata/bagnetto) | ruttino e rigurgito → aria, il resto → contatto |
| measure | w (g), l (cm); uno o entrambi | `t` = mezzogiorno del giorno scelto (oggi/ieri/…/altra data); percentile OMS calcolato al volo dall'età |
| temp | c (°C, un decimale) | ≥ 38 °C sotto i 90 giorni: mostra la bandiera rossa già presente in Altro, testo identico |
| med | what (vitd/probiotico/simeticone/paracetamolo/altro), name | "Vitamina D" ha il tap rapido in Salute e in Home (solo dopo il primo uso) |
| appt | kind (bilancio/vaccino/visita/esame/altro), title, place, note, done | `t` = data e ora dell'appuntamento (futuro); non compare nel diario; esportabile in .ics |
| cry | dur (s), label (fame/sonno/cambio/aria/contatto/solo/null), bins {f,a,h}, ctx (snapshot), feat {vec[12], meanF0, sdF0, meanRms, bursts10, meanBurst, meanPause, voiced, cent, durS}, audio (bool, **solo locale**), mime, audioPath (percorso nel bucket, `<family_id>/<id>.<ext>`), rec {mime, bytes, frames, err} (esito della registrazione, mostrato nel dettaglio del pianto) | audio in IndexedDB, chiave = id, valore `{buf: ArrayBuffer, mime}` (i Blob in IndexedDB su iOS sono fragili; i vecchi Blob restano leggibili) |

Impostazioni: `settings {name, birth (YYYY-MM-DD), feedH (ore | null = per età), _updated}`.

Crescita (`js/who.js`): standard OMS 2006 maschi, parametri LMS di peso e lunghezza per età campionati ogni
7 giorni da 0 a 2 anni (fonte: tabelle ufficiali WHO, via pacchetto npm `who-growth-standards`, MIT). z = ((x/M)^L − 1)/(L·S),
percentile = Φ(z), interpolazione lineare fra i campioni. Il grafico disegna le bande 3°–97° e 15°–85°, la mediana e la
traiettoria di Alan; il percentile mostrato è un calcolo, la lettura la fa il pediatra.

Tappe (`MILESTONES`): bilanci di salute e calendario vaccinale nazionale per mese di età; sono suggerimenti, spariscono quando
esiste una visita dello stesso tipo entro ±45 giorni o quando la tappa è passata da oltre 45 giorni.

Locale: IndexedDB `alan-v2` (store `kv` → `state` JSON, store `audio` → `{buf,mime}`), mirror in localStorage `alan.v2`.
Code offline in localStorage: `alan.outbox` (voci), `alan.audio.outbox` (id dei pianti con audio da caricare), `alan.settings.outbox`.
Diagnostica in localStorage `alan.diag`.

Remoto (opzionale, `supabase/schema.sql`):
- tabella `events`: `data` jsonb contiene tutti i campi tranne id/t/k/who/audio; soft delete con `deleted`; conflitti risolti per
  `updated_at` (last-writer-wins). La cancellazione porta `updated_at` = momento della cancellazione, così il pull incrementale
  dell'altro telefono la vede anche se ha perso il messaggio realtime.
- tabella `family_settings`: una riga per famiglia (name, birth, updated_at), stesso last-writer-wins; se il server è vuoto vincono le impostazioni locali.
- bucket privato `cries` (file fino a 10 MB): un oggetto per pianto in `<family_id>/<id>.<ext>`; upload subito dopo il salvataggio (o alla prossima
  rete), download al primo ascolto sull'altro telefono (poi resta in IndexedDB), rimozione quando il pianto è cancellato.
- Sync (`js/sync.js`, supabase-js 2.49.4 UMD): pull incrementale per `updated_at` a pagine da 1000; canale realtime
  `family-<id>` con `postgres_changes` su events e family_settings + presence (payload `{name}`: l'intestazione mostra una pillola per genitore, verde se ha l'app aperta); risottoscrizione con
  backoff e al ritorno in primo piano. I timestamp di Postgres (`+00:00`, microsecondi) sono normalizzati a ISO UTC con
  millisecondi prima di ogni confronto. Auth: email + password (utenti creati in dashboard), nessun flusso email; il callback
  di `onAuthStateChange` non fa chiamate dirette (deadlock del lock auth), rimanda a un tick dopo.
- Contratto con `js/app.js`: ogni mutazione locale passa da `touched(e)` / `removed(e)`; le righe remote entrano da
  `mergeRemote(list)`, le impostazioni da `mergeRemoteSettings(row|null)`. In `mergeRemote` un evento nuovo entra con `audio=false`;
  su un evento esistente `audio` non viene mai sovrascritto dal remoto.

## 3. Etichettatura dei pianti
- Un pianto salvato resta "aperto" (`openCry`). La prima azione registrata con `t` in [cry.t − 5 min, cry.t + 45 min] gli
  assegna la label: feed (ml > 0)→fame, sleep→sonno, diaper→cambio, other→aria|contatto. `wake` e feed con ml = 0 non etichettano.
- La regola vale anche per le azioni che arrivano dall'altro telefono (`mergeRemote`), e un pianto aperto registrato dall'altro
  telefono resta aperto anche qui se ha meno di 45 minuti: il pianto si spiega da qualunque dei due telefoni. Se lo spiegano
  entrambi in modo diverso vince l'ultima modifica.
- Alternative esplicite: "si è calmato da solo" (label `solo`, esclusa dall'addestramento), "decido dopo", "falso allarme" (cancella).
- La label si può cambiare a posteriori dal tab Pianti.

## 4. Motore
### 4.1 Norme per età (settimane)
- intervallo pappe atteso: <6 → 3 h, <12 → 3,5 h, else 4 h. Se in Impostazioni i genitori hanno scelto un intervallo (`settings.feedH`, condiviso via `family_settings.feed_h`; 3 / 3,5 / 4 / 4,5 h), vale quello ovunque: modello, riquadro "Ultima pappa", promemoria e previsioni (la pappa prevista è ultima pappa + intervallo, base "impostato"). Ridotto ×0,75 se l'ultima pappa < 70% della tipica; inoltre ×0,7 se ml/prep < 0,4, ×0,85 se < 0,7.
- finestra di veglia: <4 → 55 min, <8 → 70, <12 → 85, else 105.

### 4.2 Modello di contesto (score → normalizzati)
- fame = 0,05 + 0,9·σ((sinceFeed/atteso − 0,75)·8)
- sonno = 0,05 + 0,85·σ((awake/finestra − 0,8)·6); se sveglio <10 min dopo un pisolino <40 min → max(., 0,55)
- cambio = 0,08 + 0,45·σ((sinceDiaper/2,5 − 1)·4) (+0,2 se pappa < 30 min fa)
- aria = 0,05 + 0,35·(1 − sinceFeed/0,75) se pappa < 45 min fa
- contatto = 0,35 tra le 17 e le 23, altrimenti 0,18

### 4.3 Personalizzazione (Dirichlet a due livelli, conteggi sui pianti etichettati)
- bin f (sinceFeed/atteso): <0,5 | <0,85 | <1,15 | ≥1,15; bin a (awake/finestra): <0,5 | <1 | ≥1; bin h: 0–6 | 6–12 | 12–17 | 17–24.
- g_c = (n_global_c + 6·m_c)/(n_global + 6); p_c = (n_simili_c + 4·g_c)/(n_simili + 4), simili = stesso bin f e a.

### 4.4 Impronta acustica (Web Audio, AnalyserNode fftSize 2048, un frame ogni 50 ms)
Per frame: RMS, ZCR, centroide spettrale (<5 kHz), F0 per autocorrelazione (150–1000 Hz, soglia 0,45).
Frame attivi: RMS > max(0,006; 0,25·p95). vec[12] = [quota attiva, F0 media, F0 sd, F0 p90−p10, RMS media, RMS cv,
raffiche/10 s, durata media raffica, durata media pausa, centroide medio, ZCR medio, pendenza media F0].
Servono almeno 16 frame e 6 attivi, altrimenti niente impronta (il pianto si salva comunque).

Registrazione (ordine pensato per iOS, PWA da Safari): l'AudioContext nasce e viene ripreso dentro il tap su "Piange", prima
di getUserMedia (creato dopo resterebbe sospeso e l'analisi sarebbe muta); se dopo 2 s non arriva segnale il microfono viene
ricollegato una volta. MediaRecorder preferisce `audio/mp4` e parte senza timeslice (un solo blob a stop). Il riascolto
sblocca l'elemento audio nel tap con un wav muto, poi gli dà la sorgente vera.

### 4.5 Voto acustico e fusione
- k-NN (k=5) su vec z-scorato sui pianti etichettati con feat, peso 1/(d+0,35), smoothing 2%. Servono almeno 3 pianti etichettati con impronta.
- Peso del suono w = min(0,6; n/(n+12))·calib; calib = 0,5 se n<8, altrimenti clamp((acc_suono − acc_caso)/0,3; 0; 1).
- p_finale ∝ p_contesto^(1−w) · p_suono^w.
- Precisione = leave-one-out su tutti i pianti etichettati: contesto, suono, insieme, e baseline "causa più frequente".

## 5. UI
- "Quando" in ogni percorso: adesso / 15 / 30 / 60 min fa / "altra ora" (selettore HH:MM; un orario nel futuro di oltre 5 min vale per ieri). Nella Pappa anche "finita alle": la differenza diventa `dur` (secondi, ≤ 6 h) con `src 'biberon'`.
- Intestazione: nome ed età a sinistra, a destra le pillole di presenza (nessun selettore di chi registra).
- Tab Salute: Crescita (Peso/Lunghezza, valore grande + percentile, grafico OMS, registrazione a stepper con "quando"),
  Vitamina D e medicine (tap unico + 7 giorni), Temperatura (chip + stepper ±0,1), Visite e vaccini (prossima in evidenza con
  conto alla rovescia, "Nel calendario" = file .ics con promemoria il giorno prima, "Fatta", tappe in arrivo con "Programma").
- Home: sotto i riquadri di stato, la riga salute (Vitamina D di oggi, visita entro 14 giorni) e, dalle 5 alle 13, il riepilogo
- Tab Momenti (`js/momenti.js`, §9.7): intestazione con l'età di oggi e la frase del giorno, Prime volte, Album (griglia 3 colonne, visore a schermo intero), Racconta un momento, Questa settimana in numeri, Lettere.
- Home, blocchi delle estensioni (§9): in `#extTop`, sopra i riquadri di stato, il cronometro (`timer`) e le due righe delle previsioni (`predict`); in `#extMid`, sotto il riepilogo della notte e sopra "Piange", i promemoria (`reminders`). Gli altri riquadri delle estensioni stanno in coda a Pattern (slot `stats`: Allattamento, Ritmo, statistiche della settimana), in fondo a Salute (slot `salute`: Svezzamento) e in Altro sopra Impostazioni (slot `altro`: Promemoria, Per il pediatra).
  della notte (22–7: pappe e ml, cambi, pianti, sonno, chi si è alzato; tocca per l'elenco).
- Tema: Altro → Impostazioni, Automatico/Chiaro/Scuro (`alan.theme` in localStorage, `data-theme` su `<html>` applicato da uno script inline prima del primo disegno; senza scelta vale il sistema).
- Font Atkinson Hyperlegible; palette light/dark via `prefers-color-scheme`; tap target ≥ 44 px su ogni controllo (verificato a 390 px, chiaro e scuro); percorsi a schermo intero; toast su più righe, mai troncato.
- Colori causa: fame #D9962A, sonno #5B73D9, cambio #2E9E6E, aria #B266A6, contatto #D96A5C; accento #F0B040. In dark mode le etichette causa usano inchiostro scuro.
- I pulsanti che aspettano la rete (Accedi, Sincronizza adesso, Esci, Prova il microfono, ▶ che scarica) mostrano uno stato di attesa e non accettano un secondo tocco.
- Altro → Diagnostica: versione app, modalità (installata/browser), sistema, formati registrabili, archivio, pianti (locali/cloud/da inviare), sync, spazio; poi i passi dell'ultima registrazione con ✓/✗/… e il motivo. "Condividi la diagnostica" manda il testo.
- Le tavole di riferimento sono nel canvas Design "Alan — cosa vuole? · schermate".

## 6. Aggiornamenti e cache
- `sw.js`: cache-first della shell, un solo numero `VERSION`. A ogni release si alza `VERSION`: il nuovo worker si installa e resta in attesa senza attivarsi; la pagina lo rileva (all'apertura, al ritorno in primo piano, ogni ora) e mostra il banner "Nuova versione, tocca per aggiornare"; al tocco manda `SKIP_WAITING` e si ricarica al cambio di controller. I file in cache sono scaricati saltando la cache HTTP. Niente `?v=` sugli asset.
- Le chiamate a Supabase non passano dal service worker.

## 7. Test
`sh tests/check.sh`: sintassi + suite in Node con stub DOM (`tests/stub.js`): motore e percorsi (`engine`), etichettatura (`labeling`),
`mergeRemote` e impostazioni (`merge`), pappa rifiutata (`feed`), estrattore su frame sintetici (`features`), `js/sync.js` contro un
client Supabase simulato (`sync`). Qualsiasi cambio al modello deve restare valutabile in "Quanto ci azzecca" (LOO).
Ogni estensione ha la sua suite (`timer`, `predict`, `reminders`, `stats`, `report`, `svezzamento`, `momenti`), che carica `js/<nome>.js` dopo app.js con `boot({ext:['<nome>']})`; le regole con l'ora prendono un istante finto dove l'API lo permette (`compute(now)`, `open(days, now)`).

## 8. Roadmap
1. Pulsante "Piange" anche dalla lock screen: shortcut iOS che apre l'URL `?cry=1` → l'app parte già in registrazione.
2. Notifica "è ora della pappa?" quando sinceFeed supera l'atteso (Web Push richiede iOS 16.4+ e PWA installata).
3. Esportazione CSV del diario.
4. Se il suono si dimostra informativo: sostituire il k-NN con regressione logistica sui 12 feature + contesto (sempre con LOO).

## 9. Estensioni
Ogni funzione aggiuntiva vive in `js/<nome>.js`, si registra su `window.AlanExt` (percorsi a tap `flow`, blocchi Home `home`,
tab intere `tab`, riquadri in Pattern/Salute/Altro `slot`, `describe`, `hide` e `row` per il diario (html in coda alla riga e/o tap sulla descrizione), hook `on('change')` a ogni
salvataggio o merge) e non tocca `js/app.js`: tutto ciò che le serve passa da `AlanExt.api` (sezione "estensioni" di app.js).
Gli script si caricano in `index.html` dopo `app.js`, nell'ordine timer, predict, reminders, stats, report, svezzamento, momenti, note.
Ogni estensione ha la sua suite `tests/<nome>.test.js` (caricata con `boot({ext:['<nome>']})`) e il suo blocco CSS delimitato da
`/* == nome == */ … /* == /nome == */` in `css/app.css`, con i soli token di colore. Le regole di §5 valgono anche qui: solo tap,
target ≥ 44 px, un'idea per schermata, numeri come fatti e mai come giudizi.

### 9.1 Cronometro (`js/timer.js`)
In Home, sopra i riquadri di stato (`#extTop`), la riga "Cronometro" con "Inizia la pappa". Stato volatile e locale al telefono
(non sincronizzato: l'altro genitore vede la pappa solo quando è salvata): localStorage `alan.timer` = `{start (epoch ms)}`; il tempo
mostrato si calcola sempre dai timestamp, quindi sopravvive alla chiusura dell'app e al cambio di tab (ogni secondo si aggiorna solo
`#tmClock`, mai tutta la Home; l'intervallo parte solo con un cronometro attivo e si spegne alla fine).
Il riquadro attivo mostra "Pappa in corso", ora d'inizio, cronometro, "Fine" e "Annulla senza salvare" (con conferma). Fine apre il
percorso Pappa con `flow.data.src='biberon'`, `flow.data.dur` e "quando" = minuti dall'inizio; la voce salvata riceve `src` e `dur`
dall'hook `change` (localStorage `alan.timer.pending` finché la voce non compare, scade dopo 6 h); se si esce dal percorso Pappa con
"‹" la durata si perde, il cronometro è già chiuso.
Pattern, in coda: riquadro "Quanto dura la pappa" solo se negli ultimi 7 giorni ci sono pappe con durata: media, più corta / più
lunga, ml al minuto. Solo biberon: nessun allattamento al seno né tiralatte nell'app.

### 9.2 Previsioni (`js/predict.js`)
Nessun dato nuovo: le previsioni sono calcolate al volo dagli eventi `sleep`/`wake`/`feed`. Osservazioni degli ultimi 7 giorni
(fino a `now`): **veglie** = da un `wake` alla `sleep` successiva (5–240 min); **pisolini** = da una `sleep` al `wake` successivo
(5–600 min), "di giorno" se la nanna è iniziata tra le 7 e le 19, altrimenti "di notte"; **intervalli pappe** = tra due pappe
valide consecutive (`fedFeed`: ml > 0), 0,5–8 h. Una `sleep` dopo un'altra `sleep` (o un `wake` dopo un
`wake`) non produce osservazioni. Valore atteso di ogni grandezza: con meno di 4 osservazioni vale la norma per età
(`norms(ageDays())`: `awakeMin`, `feedH`, senza le riduzioni del modello di §4.1), da 4 a 10 osservazioni 70 % media di Alan +
30 % norma (basis `misto`), oltre 10 la sola media di Alan (basis `alan`); soglie e pesi sono costanti in cima al file.
Prossima nanna = ultimo risveglio + veglia attesa (solo se è sveglio e c'è un risveglio registrato); prossima pappa = ultima pappa
valida + intervallo atteso; prossimo risveglio (solo se dorme) = inizio nanna + durata attesa del pisolino, sul pool dei pisolini
dello stesso tipo: di giorno con la norma di ripiego di 45 min, di notte senza ripiego (sotto le 4 tratte di notte non si prevede
nulla). `AlanExt.predict.{nextNap,nextFeed,nextWake}(now)` restituiscono `{at, minutes, basis:'alan'|'misto'|'norma', n, expected}`
o `null`; `observations(now)`, `expected(vals,norm)`, `rel`, `phrase` sono esposti per i test.
UI. Home, in `#extTop` dopo il cronometro: una riga per il sonno (`--c-sonno`: "Probabile nanna tra 25 min · verso le 14:40",
oppure "Probabile risveglio tra 20 min · verso le 15:00" mentre dorme) e una per la pappa (`--c-fame`: "Pappa prevista tra 1 h 10 ·
verso le 15:10"). Sotto i 5 minuti "tra poco"; se il momento è passato la frase diventa "Nanna attesa da 12 min" / "Pappa attesa
da 12 min" / "Risveglio atteso da…", senza colori di allarme. Ogni riga è un pulsante (≥ 48 px) che apre il percorso Nanna o
Pappa. Le righe si ridisegnano a ogni salvataggio/merge (app.js ridisegna i blocchi Home) e da sole ogni minuto (solo in Home,
fuori dai percorsi). Finché non esiste nessuna pappa né nanna compare un accenno ("Dopo la prima pappa e la prima nanna qui
compare…"). Pattern, in coda: riquadro "Ritmo di <nome>" con veglia media, intervallo medio tra le pappe, pisolino di giorno e
sonno di notte degli ultimi 7 giorni, ciascuno con la norma per età e il numero di osservazioni; una riga dice su che base
poggiano le previsioni (norma per età / ritmo e norma / ritmo) e la differenza in minuti rispetto alla norma, come fatto, mai
come giudizio. Limite: sono medie, non modelli per fascia oraria; con nanne mai chiuse da un risveglio le veglie non si contano
e si cade sulla norma.

### 9.3 Promemoria (`js/reminders.js`)
Promemoria interni, senza notifiche push: compaiono in Home quando l'app è aperta. Nessun dato nuovo nel diario: l'unica
scrittura è il tap «Segna» sulla vitamina D, che registra un normale evento `med` (`what` = vitd, `name` = Vitamina D, `who` dal
profilo) tramite `A.quickMed`, quindi passa da `touched()` e viaggia in sync come gli altri. Stato solo locale, in localStorage:
`alan.rem.cfg` = `{vitd, appt, feed}` booleani (interruttori, tutti accesi se assenti o non validi) e `alan.rem.dismissed` =
`{chiave: 'YYYY-MM-DD'}` (righe nascoste con «Ok»; le voci di giorni diversi da oggi decadono da sole). Le chiavi sono `fever`,
`appt:<id>`, `feed:<t ultima pappa>`, `vitd`: una nuova pappa o una nuova visita cambiano la chiave, quindi il promemoria
ritorna anche se il precedente era stato nascosto.
UI in Home (blocco `#home-reminders` in `#extMid`, sotto il riepilogo della notte e sopra «Piange»): al massimo due righe con
bordo colorato, in quest'ordine di priorità: (1) **febbre** — temperatura ≥ 38 °C registrata nelle ultime 6 ore sotto i 90
giorni: ripete testualmente la prima bandiera rossa di Altro (`FEVER_TXT`, identica a index.html), colore `--danger`, senza
pulsanti e senza «Ok» (non ha interruttore e non si nasconde); (2) **visita** oggi o domani non ancora fatta (stessa regola di
`nextAppt`: anche passata da meno di 2 ore) con «Oggi/Domani alle HH:MM · titolo (o tipo) · luogo», colore `--c-sonno`, il testo
porta in Salute, «Ok» nasconde per oggi; (3) **pappa in ritardo** — `sinceFeedH − n.feedH > 0,5 h` (norma per età di §4.1,
senza le riduzioni del modello), informazione neutra «Ultima pappa 4 h 10 fa, di solito ogni 3 h», colore `--c-fame`; non
compare oltre 12 h dall'ultima pappa (più probabile una registrazione mancante); il biberon rifiutato non vale come pappa; (4) **vitamina D** non ancora data oggi, dalle 10:00, solo se è stata data almeno una volta nei 7 giorni
precedenti, colore `--c-cambio`, con «Segna» e «Ok» (dalle 10 in poi dice la stessa cosa della pillola «Vitamina D · non ancora
oggi» della riga salute: per evitare il doppione basta spegnere l'interruttore). Le regole si ricalcolano a ogni `renderHome` e
sull'hook `change`; un `setInterval` di 60 s ridisegna solo se il testo delle righe cambierebbe (solo il blocco se cambia il
testo, tutta la Home se compare o sparisce una riga; mai durante un percorso). L'ora è iniettabile per i test:
`AlanExt.reminders.compute(now)` restituisce le righe per quell'istante. In Altro (slot `altro`, sopra Impostazioni) la card
«Promemoria» ha tre interruttori a tap (`role="switch"`, `aria-checked`): Vitamina D, Visite, Pappa in ritardo.

### 9.4 Statistiche della settimana (`js/stats.js`)
Slot `stats`, in fondo a Pattern. Nessun dato proprio: calcoli sugli eventi, esposti su `AlanExt.stats` = {nights(now),
milkPerDay(now), feedTimes(now), diapersPerDay(now)} e ridisegnati a ogni `renderStats`. Quattro schede, ognuna con titolo, grafico SVG inline (viewBox
largo 360, classi `.gc .grid .lbl` del grafico di crescita, colori dai token via `--hc`) e una riga di lettura fattuale, mai un
giudizio; senza dati ogni scheda mostra un testo di attesa. I tre grafici condividono l'ordine cronologico (da sinistra a
destra, dall'alto in basso).
1. **Sonno per notte**: barre delle ultime 7 notti complete dalle 22 alle 7 (dalla più vecchia a "ieri", etichetta = giorno in
   cui la notte è cominciata; la notte in corso non compare, la riassume la Home), ore dormite = sovrapposizione degli intervalli
   Nanna→Sveglio con la finestra (una nanna aperta arriva fino ad adesso); una notte senza sonno segnato si vede come "—" e non
   entra nella media (uno zero sarebbe falso: il sonno non era tracciato); linea tratteggiata = media, lettura "in media 9 h 20 a
   notte, su N notti".
2. **Latte al giorno**: ml dei biberon (feed con ml > 0) per ciascuno degli ultimi 7 giorni, oggi in corso più chiaro e
   fuori dalla media; media sui giorni interi con almeno una pappa (o su oggi se è l'unico), lettura "in media 640 ml al giorno,
   su N giorni".
3. **Quando mangia**: 7 righe (dal più vecchio a oggi) sull'asse delle 24 ore, un pallino per pappa, i pianti come tacche rosse, la notte 22–7 in ombra, un segno tratteggiato sull'ora attuale nella riga di oggi; lettura
   "in media 6,5 pappe al giorno · una ogni 3 h 10 · N pianti in 7 giorni" (intervallo medio fra pappe consecutive fra 30 min e
   8 h, stessa regola di Pattern). Pappe con ml = 0 non contano.
4. **Pannolini**: due grafici a barre impilate (pipì e cacca), una barra per giorno con i cambi in cui c'era, divisa per
   quantità (poca chiara, normale media, tanta piena; i valori si normalizzano con `lvlKey`, il vecchio `si` conta come
   normale); il totale sopra la barra, oggi in corso più chiaro e fuori dalla media; media tratteggiata sui giorni interi con
   almeno un cambio. Letture: "in media 3,2 cambi al giorno, su N giorni" e per ciascun grafico "3,2 al giorno · 6 poca · 9
   normale · 6 tanta in 7 giorni". Solo conteggi, nessuna soglia: quanto è giusto lo dice il pediatra.
Decimali in italiano con la virgola; l'unità dell'asse è scritta una volta sola sopra l'asse; le etichette dei valori hanno un
alone del colore della superficie (`paint-order:stroke`) per restare leggibili sopra le barre.

### 9.5 Riepilogo per il pediatra (`js/report.js`)
In Altro la card "Per il pediatra" ha le chip 7/30/90 giorni (scelta in localStorage `alan.report.days`, default 30, non
sincronizzata: è una preferenza del telefono) e il pulsante "Prepara il riepilogo (N giorni)", che apre il percorso a schermo
intero `report` (render in `#screenInner`, `finish` ritorna sempre `false`: non crea eventi). Nessun dato nuovo: il riepilogo è
un calcolo sugli eventi esistenti, `AlanExt.report.compute(days, now)`, e lo stesso modello di sezioni produce l'html e il testo
(`AlanExt.report.text(days, now)`), così i due non divergono. Periodo = gli ultimi N giorni **completi** (da N giorni fa alle
00:00 a oggi alle 00:00: oggi non entra nelle medie, così i numeri non cambiano con l'ora in cui si prepara il riepilogo); se il
diario è cominciato oggi vale la sola giornata in corso (`partial`, dichiarato nell'intestazione). Le medie al giorno dividono
per i giorni del periodo con almeno una voce di diario (feed/diaper/sleep/wake/other/cry/temp/med; misure e visite non contano),
mai per giorni vuoti, e il numero di giorni usato è scritto nell'intestazione ("N giorni con il diario" quando N < periodo). Gli
elenchi (misure, temperature, medicine, visite) arrivano invece fino ad adesso.
Sezioni: intestazione (nome, data di nascita gg/mm/aaaa, età in settimane e giorni, data e ora del riepilogo, periodo); Misure =
ultime 5 misure di sempre in tabella (data, età in settimane, peso e lunghezza con il percentile OMS calcolato all'età della misura
via `pctOf('wfa'|'lhfa')`, più "Ultimo peso: ±N g in N giorni" fra le ultime due pesate; tabella al posto del grafico perché più
leggibile in stampa); Pappe = pappe valide al giorno (`fedFeed`: ml > 0), ml al giorno e per
biberon, intervallo medio fra pappe consecutive (solo intervalli fra 30 min e 8 h), biberon rifiutati; Sonno =
media della notte 22–7 sulle notti con sonno segnato, pisolini al giorno (nanne iniziate fra le 7 e le 22) con durata media, sonno
nelle 24 ore sui giorni con sonno segnato; Cambi = al giorno, con pipì, con cacca e le quantità poca / normale / tanta; Pianti = al giorno, durata media registrata,
senza spiegazione, e le cause in % sui pianti spiegati ("passato da solo" compreso); Temperature = elenco dal primo giorno del
periodo a adesso, più recente in alto, con la più alta; Medicine = per nome, quante volte e l'ultima; Visite e vaccini = fatte
(done, dal primo giorno del periodo) e in programma (non fatte, da adesso, massimo 5); Note = le note dei genitori sulle voci
del periodo (§9.8), in ordine di tempo, con la voce e chi le ha scritte.
In fondo "Stampa o salva PDF" (`window.print()`; la classe `rp-print` su `<body>`, messa da `AlanExt.report.print()` e tolta ad
`afterprint`, attiva il CSS di stampa: nero su bianco, A4 con margini 16 mm, solo `#screenInner`; stampare da un'altra schermata
resta come prima) e "Condividi come testo" (`navigator.share` del testo, altrimenti appunti, altrimenti toast). Il riepilogo
aperto si ridisegna a ogni `change` (salvataggio o merge dall'altro telefono). `open(days, now)` accetta un istante facoltativo
solo per i test. Nessun giudizio: i numeri sono quelli del diario, e la nota a piè di pagina lo dice. Limiti: nella PWA
installata su iPhone `window.print()` può non aprire nulla (il pulsante mostra un toast che rimanda a "Condividi come testo"); da
Safari la stampa funziona e da lì si sceglie "Salva in File"/PDF; stampando dal menu di Safari senza passare dal pulsante il CSS
di stampa non si attiva. Le curve OMS restano quelle dei maschi (`js/who.js`).

### 9.6 Svezzamento (`js/svezzamento.js`)
Dati: evento `food` (riga in §2); per ogni alimento contano l'ultima prova (data e reazione) e il numero di prove; la grafia
mostrata è quella dell'elenco dei suggeriti se il nome vi corrisponde, altrimenti l'ultima scritta. Vive tutto in Salute (slot
`salute`, in fondo alla tab): nessun blocco Home e nessun riquadro Pattern, per rispettare "un'idea per schermata".
Sotto i 120 giorni di età e senza voci `food` una card discreta: "Svezzamento — Si attiva verso i 4 mesi: qui segnerai gli
alimenti provati e com'è andata, uno alla volta." Dai 120 giorni, o appena esiste una voce `food` (anche arrivata dall'altro
telefono o dopo una correzione della data di nascita), la card piena: riepilogo "N alimenti provati, K da riprovare, J con
reazione" (da riprovare = ultima prova "non gradito", con reazione = ultima prova "reazione": conteggi, non giudizi), gli ultimi
tre assaggi (data, nome, quanto, etichetta colorata della reazione, nota, chi, ×: elimina con `A.del` e ridisegna), il pulsante
"Nuovo alimento", da quattro alimenti in su il riquadro a scomparsa "Tutti gli alimenti provati (N)" (per alimento: ultima data,
quante volte, ultima reazione, nota, gruppo), poi i suggeriti a gruppi (Cereali e creme, Verdure, Frutta, Carne pesce uova e
legumi, Latticini) come chip con un bordo del colore del gruppo, senza quelli già provati e con il contatore "k su n provati";
ogni gruppo mostra al massimo sei chip più un chip "+N" che apre il percorso con l'elenco completo; un gruppo esaurito dice
"Tutti provati.". In chiusura il promemoria neutro "un alimento nuovo alla volta". Nessuna data, ordine o consiglio: gli elenchi
sono solo nomi comuni della cucina italiana, raggruppati.
Percorso `food` a tre passi con la riga "Quando" (adesso/15/30/60 min fa): 1) alimento — chip dei suggeriti a gruppi (esclusi i
provati), "Già provati · tocca per riprovare" con i nomi già registrati, "Altro: scrivo io il nome" (unico campo a tastiera, Invio
= Avanti; entrando in questo passo un nome venuto da un chip si azzera, un nome scritto a mano resta se si torna indietro);
toccando un chip in Salute si parte già dal passo 2; 2) "Quanto ne ha mangiato?" Assaggio/Poco/Tutto; 3) "Com'è andata?"
Bene/Non gradito (salvano subito) o Reazione, che apre "Cosa hai notato?" con una nota breve facoltativa e "Salva". Ogni passo ha
"Indietro"/"Cambia alimento". I nomi degli alimenti non passano mai da `onclick` (i chip chiamano `start(gruppo, indice)` /
`pick(indice)` su un array ricostruito a ogni render) e nel diario e nella card tutto passa da `esc`. La card si ridisegna su
`change` solo se cambia la firma (numero di voci `food`, ultima voce e suo `_updated`, età), solo in Salute e senza percorso aperto.

### 9.7 Momenti (`js/momenti.js`, tab "Momenti")
Due tipi di evento, `moment` e `letter` (righe in §2), piatti e sincronizzati come gli altri, nascosti dal diario di Home
(`AlanExt.hide`). Prima volta: 15 tappe fisse (sorriso, risata, notte5, pancia, bagnetto, passeggiata, vocalizzo, presa,
cucchiaio, dentino, gira, seduto, gattona, parole, passi); `t` = adesso se il giorno scelto è oggi, altrimenti mezzogiorno del
giorno (oggi/ieri/…/altra data, come le misure); l'età alla tappa è calcolata da `t` e dalla nascita ("a 6 settimane e 2
giorni"), nessun range atteso e nessun confronto. Foto: ridimensionate sul telefono con canvas (lato lungo ≤ 1280 px, JPEG
qualità 0,82), salvate in IndexedDB store `files` come `{buf, mime}` (mai in localStorage) dopo che `A.finish` ha assegnato
l'id, caricate nel bucket `cries` con lo stesso giro dell'audio (`AlanSync.uploadAudio`; l'oggetto finisce come
`<family_id>/<id>.bin` con contentType image/jpeg perché `extFor` conosce solo i formati audio): coda `alan.momenti.outbox` (id)
in localStorage, ritentata su `change`, al ritorno della rete, in primo piano e 1,5 s dopo l'apertura; a upload riuscito l'evento
riceve `photoPath` e passa da `touched`. Sull'altro telefono la griglia controlla con `fileGet` quali foto sono sul telefono:
quelle assenti con `photoPath` mostrano "tocca per scaricare" (download al tap, poi restano in `files`), quelle assenti senza
`photoPath` mostrano "in arrivo dall'altro telefono". Eliminare un momento con foto rimuove evento, file locale, oggetto nel
bucket e voce in coda. L'orientamento EXIF è quello applicato dal browser, senza correzione manuale.
UI della tab: intestazione "<nome> oggi ha N settimane e M giorni" e una frase del giorno scelta in modo deterministico dal
giorno dell'anno (20 frasi, `dayOfYear % 20`, uguale sui due telefoni); "Prime volte" (fatte in cima in ordine di data con età,
data e chi, una per tappa: se registrata da entrambi resta la più vecchia; poi le altre con "È successo!"); "Album" (griglia 3
colonne quadrata, tap → visore a schermo intero `momentview` con didascalia, età, chi l'ha scattata, Condividi via
`navigator.share` con File se accettato, altrimenti download, ed Elimina; sotto gli ultimi 5 racconti senza foto); "Racconta un
momento" (percorso `moment`: Scatta con `capture=environment` o Dalla galleria, didascalia, quando); "Questa settimana in numeri"
(ultimi 7 giorni: pappe bevute, sonno medio per notte sulle finestre 22–7 con almeno un sonno, "media su N notti", pianti
spiegati su totali, momenti e lettere, alzate notturne per genitore presentate come squadra, escluso `who='Io'` come in Home);
"Lettere" (percorso `letter` con textarea, elenco per data con chi e prima riga, visore `letterview` con testo intero). Tastiera
solo per didascalia e lettera. I percorsi sono `flow` dell'API, così indietro, chiusura e toast sono quelli dell'app;
`resize`, `shareFile`, `objUrl`, `fileGet/filePut/fileDel`, `cloudUpload/Download/Remove` e `syncReady` si sostituiscono nei test.

### 9.8 Note sulle voci (`js/note.js`)
Una nota libera (≤ 200 caratteri, spazi e a capo normalizzati) su qualsiasi voce del diario tranne le visite e le voci nascoste;
vive sulla voce (`note`, `noteBy` = nome del profilo di chi scrive) e passa da `touched` + `save`, quindi si sincronizza come
la voce. Dove: in Oggi ogni riga del diario è toccabile sulla descrizione (`row` dell'API: `.row.tap`, target ≥ 44 px) e mostra
la nota sotto, con "— nome" solo se chi ha scritto è diverso da chi ha registrato; finché non esiste nessuna nota un
suggerimento in fondo al diario (`home` in `#extBottom`). In Salute la scheda "Note" elenca le ultime 20 note dalla più
recente ("e altre N" oltre) e il pulsante "Scrivi una nota" apre il percorso `notepick`: le voci delle ultime 3 giornate,
dalla più recente, tap → percorso `note`. Il percorso `note` mostra la voce, una textarea con contatore, "Salva la nota" e,
se esiste, "Togli la nota"; salva con `A.finish('save'|'clear')` (il `finish` dell'estensione aggiorna la voce e torna
`false`, così app.js non crea una voce nuova); testo uguale → "Nessuna modifica". Il riepilogo per il pediatra (§9.5) aggiunge
la sezione "Note" (data, ora, voce · testo, chi) con le note del periodo, riportate così come sono. Nessun consiglio.
Esposto su `AlanExt.note` = {text, has, clean, set, all, recent, open, typed, card}.
