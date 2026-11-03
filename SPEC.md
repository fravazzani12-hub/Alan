# SPEC — Alan, cosa vuole?

Requisiti dichiarati dal committente (Fabio), scelte fatte, e come funziona il motore. Questo file è la fonte di verità
per chi sviluppa (umano o Claude Code).

## 1. Requisiti
Revisione di novembre 2026 richiesta da Ilaria: l'app registra **solo quello che si usa davvero**, nel minor numero di tap.
Le funzioni dismesse (pianto, nanna, cambio pannolino generico) sono state tolte dall'interfaccia; i dati già registrati
restano nell'archivio e continuano a sincronizzarsi, semplicemente non si mostrano e non si creano più. La storia di quelle
funzioni (motore delle cause, impronta acustica, ascolto automatico) è nella cronologia di git fino alla v32.

1. Inserimento **solo a tap**: nessun valore da digitare. I ml si scelgono fra le quantità più usate o con lo stepper ±5.
2. Home = tre pulsanti: **Pappa** (quando + quanto), **Cacca** (quando + quanta), **Altro** (ruttino, ciuccio, coccole…).
   Due tap dal pulsante al salvataggio.
3. Due genitori (Fabio e Ilaria) con i dati allineati tra i telefoni: diario e impostazioni.
4. Salute, Momenti, Pattern e il riepilogo per il pediatra restano: misurano quello che si registra, senza giudizi.
5. I problemi devono essere leggibili dal telefono, senza strumenti da sviluppatore (Altro → Diagnostica).

## 2. Modello dati (evento = oggetto piatto, `id` client-side, `t` epoch ms, `k` tipo, `who` chi ha registrato, `_updated` ISO UTC dell'ultima modifica)
`who` = nome dal profilo dell'utente loggato (`user_metadata.name`, blocco 7 dello schema; altrimenti la parte locale dell'email), non selezionabile; senza account resta "Io".
| k | campi | note |
|---|---|---|
| feed | ml (ml bevuti, a passi di 5; 0 = biberon rifiutato) | una pappa con ml = 0 non conta come ultima pappa e non entra nel tipico. Le voci delle versioni precedenti possono avere anche `prep`, `dur` e `src`: restano salvate, non si mostrano più |
| food | name (≤ 40 caratteri, spazi normalizzati), group (cereali/verdure/frutta/proteine/latticini, `altro` per i nomi scritti a mano), amount (assaggio/poco/tutto), reaction (bene/nongradito/reazione), note (≤ 120 caratteri, solo con `reaction = reazione`, altrimenti '') | `js/svezzamento.js`; alimenti distinti per nome normalizzato (minuscolo, spazi collassati); nel diario `Nome · quanto · com'è andata [· nota]` |
| moment | kind ('first'/'photo'/'story'); prima volta: code, title (15 tappe fisse); foto/racconto: text (≤ 80), photo (bool: esiste una foto), photoPath (`<family_id>/<id>.<ext>` nel bucket `cries`), mime | `js/momenti.js`; nascosto dal diario di Home; prima volta con `t` = adesso se il giorno è oggi, altrimenti mezzogiorno del giorno scelto; la foto sta in IndexedDB store `files` come `{buf,mime}` |
| letter | text (≤ 4000) | `js/momenti.js`; `t` = adesso, `who` = chi scrive; nascosto dal diario |
| diaper | cacca (poca/normale/tanta; `no` solo nelle voci vecchie) | il valore `si` della v12 si legge come normale (`lvlKey`); le voci vecchie hanno anche `pipi`, che resta salvato ma non si mostra più |
| (ogni voce del diario) | note (testo ≤ 200, `noteClean`), noteBy (chi l'ha scritta) | scritti dalla schermata di modifica (`A.edit`, app.js), mostrati da `js/note.js`; campi opzionali su qualunque voce tranne appt e le voci nascoste; viaggiano nel `data` jsonb con la voce (LWW sull'intera voce) |
| other | what (ruttino/rigurgito/massaggio/ciuccio/coccole/passeggiata/bagnetto) | ruttino e rigurgito → aria, il resto → contatto |
| measure | w (g), l (cm); uno o entrambi | `t` = mezzogiorno del giorno scelto (oggi/ieri/…/altra data); percentile OMS calcolato al volo dall'età |
| temp | c (°C, un decimale) | ≥ 38 °C sotto i 90 giorni: mostra la bandiera rossa già presente in Altro, testo identico |
| med | what (vitd/probiotico/simeticone/paracetamolo/altro), name | "Vitamina D" ha il tap rapido in Salute e in Home (solo dopo il primo uso) |
| appt | kind (bilancio/vaccino/visita/esame/altro), title, place, note, done | `t` = data e ora dell'appuntamento (futuro); non compare nel diario; esportabile in .ics |
| sleep / wake / cry | campi delle versioni fino alla v32 | tipi **dismessi**: non si creano più e non compaiono nel diario; le voci esistenti restano nell'archivio e nel cloud |

Impostazioni: `settings {name, birth (YYYY-MM-DD), feedH (ore | null = per età), _updated}`.

Crescita (`js/who.js`): standard OMS 2006 maschi, parametri LMS di peso e lunghezza per età campionati ogni
7 giorni da 0 a 2 anni (fonte: tabelle ufficiali WHO, via pacchetto npm `who-growth-standards`, MIT). z = ((x/M)^L − 1)/(L·S),
percentile = Φ(z), interpolazione lineare fra i campioni. Il grafico disegna le bande 3°–97° e 15°–85°, la mediana e la
traiettoria di Alan; il percentile mostrato è un calcolo, la lettura la fa il pediatra.

Tappe (`MILESTONES`): bilanci di salute e calendario vaccinale nazionale per mese di età; sono suggerimenti, spariscono quando
esiste una visita dello stesso tipo entro ±45 giorni o quando la tappa è passata da oltre 45 giorni.

Locale: IndexedDB `alan-v2` (store `kv` → `state` JSON, store `files` → foto dei Momenti come `{buf,mime}`; lo store `audio` resta nello schema per non migrare il database, ma non si usa più), mirror in localStorage `alan.v2`.
Code offline in localStorage: `alan.outbox` (voci), `alan.settings.outbox`.
Diagnostica in localStorage `alan.diag`.

Remoto (opzionale, `supabase/schema.sql`):
- tabella `events`: `data` jsonb contiene tutti i campi tranne id/t/k/who; soft delete con `deleted`; conflitti risolti per
  `updated_at` (last-writer-wins). La cancellazione porta `updated_at` = momento della cancellazione, così il pull incrementale
  dell'altro telefono la vede anche se ha perso il messaggio realtime.
- tabella `family_settings`: una riga per famiglia (name, birth, updated_at), stesso last-writer-wins; se il server è vuoto vincono le impostazioni locali.
- bucket privato `cries` (file fino a 10 MB, nome storico): oggi ci stanno solo le **foto dei Momenti**, in
  `<family_id>/<id>.<ext>`; upload dopo il salvataggio (o alla prossima rete), download alla prima apertura sull'altro
  telefono (poi resta in IndexedDB), rimozione quando la voce è cancellata.
- Sync (`js/sync.js`, supabase-js 2.49.4 UMD): pull incrementale per `updated_at` a pagine da 1000; canale realtime
  `family-<id>` con `postgres_changes` su events e family_settings + presence (payload `{name}`: l'intestazione mostra una pillola per genitore, verde se ha l'app aperta); risottoscrizione con
  backoff e al ritorno in primo piano. I timestamp di Postgres (`+00:00`, microsecondi) sono normalizzati a ISO UTC con
  millisecondi prima di ogni confronto. Auth: email + password (utenti creati in dashboard), nessun flusso email; il callback
  di `onAuthStateChange` non fa chiamate dirette (deadlock del lock auth), rimanda a un tick dopo.
- **Niente chiamate appese.** Il lock dell'auth non è quello di serie (`navigator.locks`, che vive fuori dalla pagina e su
  Safari può restare preso quando l'app va in sottofondo, piantando ogni accesso successivo *prima* della rete): si passa a
  `createClient` un `lock` che è una coda dentro la pagina — serializza come serve, riparte pulito a ogni apertura, e un
  errore non blocca la fila. In più `getSession` (15 s) e `signInWithPassword` (20 s) hanno un tempo massimo: scaduto
  quello si risponde con un errore leggibile invece di lasciare il pulsante su "Accedo…" per sempre.
- **Libreria che non arriva.** supabase-js viene da un CDN e non passa dal service worker: se quel file non si carica
  (rete ballerina proprio all'apertura) l'accesso non si può nemmeno tentare. La schermata Account lo dice e offre
  "Riprova a caricarla" (`A.loadSync`), che la richiede e rifà `syncInit()` senza chiudere l'app.
- Contratto con `js/app.js`: ogni mutazione locale passa da `touched(e)` / `removed(e)`; le righe remote entrano da
  `mergeRemote(list)`, le impostazioni da `mergeRemoteSettings(row|null)`. In `mergeRemote` un evento nuovo entra con `audio=false`;
  su un evento esistente `audio` non viene mai sovrascritto dal remoto.

## 3. Motore
Resta solo quello che serve alle previsioni e ai riquadri: **norme per età** (`norms`, intervallo fra le pappe:
<6 settimane 3 h, <12 settimane 3,5 h, poi 4 h; se i genitori scelgono un intervallo in Impostazioni vale quello) e
**contesto** (`context`: ultima pappa valida e ultima cacca, ore trascorse, ml tipico delle ultime 10 pappe).
Il modello delle cause del pianto, l'impronta acustica e il k-NN sul suono sono stati dismessi con la v33.

## 4. UI
- Home, ordine: intestazione, i due riquadri di stato (Ultima pappa, Ultima cacca), la scheda **"Prossime tappe"**
  (`#next`), il rumore bianco (`#extMid`), i tre pulsanti (Pappa a tutta larghezza, Cacca, Altro) e "Ultime voci".
- **Pappa, una schermata sola**: "Quando" (adesso / 15 / 30 / 60 min fa / "altra ora" con selettore HH:MM; un orario nel
  futuro di oltre 5 minuti vale per ieri) e "Quanto ha bevuto?" — le quantità più usate di recente (`mlOptions`: le sei
  più frequenti delle ultime 40 pappe, arrotondate a 5; senza storia 60/90/120/150), lo stepper ±5 che parte dal ml
  tipico, "Salva N ml" e "Non ha bevuto niente" (0 ml). Niente preparato, niente durata, niente ora di fine.
- **Cacca, una schermata sola**: "Quando" e "Quanta?" fra Poca / Normale / Tanta. Un tap e la voce è salvata.
- **Altro**: ruttino, rigurgito, massaggio pancia, ciuccio, coccole, passeggiata, bagnetto.
- **I ml si contano di 5 in 5** (`ML_STEP`), nella schermata della pappa e nella modifica di una voce.
- Intestazione: nome ed età a sinistra, a destra le pillole di presenza (nessun selettore di chi registra).
- Tab Salute: Crescita (Peso/Lunghezza, valore grande + percentile, grafico OMS, registrazione a stepper con "quando"),
  Vitamina D e medicine (tap unico + 7 giorni), Temperatura (chip + stepper ±0,1), Visite e vaccini (prossima in evidenza con
  conto alla rovescia, "Nel calendario" = file .ics con promemoria il giorno prima, "Fatta", tappe in arrivo con "Programma").
- **"Prossime tappe"** (`renderNext`): una sola scheda per tutto ciò che sta per succedere. Le righe hanno lo stesso
  formato (`nextRow`: pallino del colore della cosa, testo, quando a destra, un'azione facoltativa) e arrivano dallo slot
  `next` delle estensioni — previsione della pappa (`predict`, priorità −20) e promemoria (`reminders`, 0) — più la riga
  della vitamina D di oggi con "Segna" (app.js). Senza righe la scheda non compare.
- **Ultime voci**: le ultime 12 voci raggruppate per giornata (Oggi, Ieri, poi la data). Mostra solo i tipi ancora in uso
  (`SHOWN`: feed, diaper, other, measure, temp, med, più quelli registrati dalle estensioni); le voci dei tipi dismessi
  restano nell'archivio ma non compaiono. Ogni riga è un pulsante: ora, pallino del colore del tipo, descrizione (con la
  nota sotto, §8.7), chi ha registrato e il chevron. Il tocco apre la **modifica** (`A.edit`): la voce, "Quando" (giorno e
  ora, con i selettori nativi; una data impossibile viene rifiutata), i campi del tipo (pappa: bevuto a ±50/±5 ml;
  cacca: poca/normale/tanta/no, e un valore vecchio si normalizza al salvataggio; altro: cosa; temperatura ±1/±0,1;
  medicina; misure ±100/±10 g e ±1/±0,5 cm con "Togli"), la nota (≤ 200) e "Elimina la voce". Le voci delle estensioni
  cambiano qui solo ora e nota. Salvando passa da `touched` + `save`, quindi la modifica si sincronizza; senza
  cambiamenti non tocca il timestamp.
- Tab Momenti (`js/momenti.js`, §8.6): intestazione con l'età di oggi e la frase del giorno, Prime volte, Album (griglia 3 colonne, visore a schermo intero), Racconta un momento, Questa settimana in numeri, Lettere.
- Home, blocchi delle estensioni (§8): in `#extMid`, sopra i pulsanti, il rumore bianco (`noise`). Previsioni e promemoria non hanno un blocco proprio: le loro righe stanno nella scheda "Prossime tappe" (slot `next`). Gli altri riquadri stanno in coda a Pattern (slot `stats`), in fondo a Salute (slot `salute`: Svezzamento) e in Altro sopra Impostazioni (slot `altro`: Promemoria, Per il pediatra).
- Tema: Altro → Impostazioni, Automatico/Chiaro/Scuro (`alan.theme` in localStorage, `data-theme` su `<html>` applicato da uno script inline prima del primo disegno; senza scelta vale il sistema).
- Font Atkinson Hyperlegible; palette light/dark via `prefers-color-scheme`; tap target ≥ 44 px su ogni controllo (verificato a 390 px, chiaro e scuro); percorsi a schermo intero; toast su più righe, mai troncato.
- Colori: pappa #D9962A, cacca #2E9E6E, aria #B266A6, contatto #D96A5C; accento #F0B040.
- I pulsanti che aspettano la rete (Accedi, Sincronizza adesso, Esci) mostrano uno stato di attesa e non accettano un secondo tocco.
- Altro → Diagnostica: versione app, modalità (installata/browser), sistema, archivio, voci nel diario (in tutto e mostrate), sync, spazio. "Condividi la diagnostica" manda il testo.

## 5. Aggiornamenti e cache
- `sw.js`: cache-first della shell, un solo numero `VERSION`. A ogni release si alza `VERSION`: il nuovo worker si installa e resta in attesa senza attivarsi; la pagina lo rileva (all'apertura, al ritorno in primo piano, ogni ora) e mostra il banner "Nuova versione, tocca per aggiornare"; al tocco manda `SKIP_WAITING` e si ricarica al cambio di controller. I file in cache sono scaricati saltando la cache HTTP. Niente `?v=` sugli asset.
- Le chiamate a Supabase non passano dal service worker.

## 6. Test
`sh tests/check.sh`: sintassi di tutti i js + 13 suite in Node con lo stub DOM (`tests/stub.js`). Nel nucleo: percorso
della pappa e contesto (`feed`), modifica di una voce e diario (`edit`), `mergeRemote` e impostazioni (`merge`), salute
e crescita (`health`), `js/sync.js` contro un client Supabase simulato (`sync`). Ogni estensione ha la sua suite
(`predict`, `reminders`, `stats`, `report`, `svezzamento`, `momenti`, `note`, `noise`), che carica `js/<nome>.js` dopo
app.js con `boot({ext:['<nome>']})`; le regole con l'ora prendono un istante finto dove l'API lo permette
(`compute(now)`, `open(days, now)`).

## 7. Roadmap
1. Notifica "è ora della pappa?" quando sinceFeed supera l'atteso (Web Push richiede iOS 16.4+ e PWA installata).
2. Esportazione CSV del diario.

## 8. Estensioni
Ogni funzione aggiuntiva vive in `js/<nome>.js`, si registra su `window.AlanExt` (percorsi a tap `flow`, blocchi Home `home`,
tab intere `tab`, riquadri in Pattern/Salute/Altro `slot` (con priorità opzionale: più bassa = più in alto), `describe`, `hide` e `row` per il diario (html in coda alla riga; il tocco della riga è sempre la modifica), righe della scheda "Prossime tappe" con lo slot `next` (markup condiviso `API.nextRow`, ridisegno con `API.renderNext`), sulla descrizione), hook `on('change')` a ogni
salvataggio o merge) e non tocca `js/app.js`: tutto ciò che le serve passa da `AlanExt.api` (sezione "estensioni" di app.js).
Gli script si caricano in `index.html` dopo `app.js`, nell'ordine predict, reminders, stats, report, svezzamento, momenti, note, noise.
Ogni estensione ha la sua suite `tests/<nome>.test.js` (caricata con `boot({ext:['<nome>']})`) e il suo blocco CSS delimitato da
`/* == nome == */ … /* == /nome == */` in `css/app.css`, con i soli token di colore. Le regole di §5 valgono anche qui: solo tap,
target ≥ 44 px, un'idea per schermata, numeri come fatti e mai come giudizi.

### 8.1 Previsione della pappa (`js/predict.js`)
Nessun dato nuovo: la previsione è calcolata al volo dagli eventi `feed`. Osservazioni degli ultimi 7 giorni (fino a `now`):
**intervalli fra due pappe valide consecutive** (`fedFeed`: ml > 0), tenuti solo fra 0,5 e 8 h. Valore atteso: con meno di 4
osservazioni vale la norma per età (`norms(ageDays()).feedH`), da 4 a 10 osservazioni 70 % media di Alan + 30 % norma (basis
`misto`), oltre 10 la sola media di Alan (basis `alan`); se i genitori hanno scelto un intervallo in Impostazioni vince quello
(basis `impostato`). Prossima pappa = ultima pappa valida + intervallo atteso.
`AlanExt.predict.nextFeed(now)` restituisce `{at, minutes, basis, n, expected}` o `null`; `observations(now)`,
`expected(vals,norm)`, `rel`, `phrase` sono esposti per i test.
UI. Home, nella scheda "Prossime tappe": "Pappa prevista tra 1 h 10 · verso le 15:10". Sotto i 5 minuti "tra poco"; se il
momento è passato "Pappa attesa da 12 min", senza colori di allarme. La riga è un pulsante che apre il percorso Pappa, si
ridisegna a ogni salvataggio o merge e da sola ogni minuto (solo in Home, fuori dai percorsi). Finché non esiste nessuna
pappa compare un accenno. Pattern, in coda: riquadro "Ritmo di <nome>" con l'intervallo medio fra le pappe degli ultimi
7 giorni, la norma per età, il numero di osservazioni e su che base poggia la previsione; la differenza rispetto alla norma
è un fatto, mai un giudizio.

### 8.2 Promemoria (`js/reminders.js`)
Promemoria interni, senza notifiche push: compaiono nella scheda "Prossime tappe" di Home quando l'app è aperta. Nessun dato
nuovo nel diario: l'estensione non scrive eventi. Stato solo locale, in localStorage: `alan.rem.cfg` = `{appt, feed}` booleani
(interruttori, accesi se assenti o non validi) e `alan.rem.dismissed` = `{chiave: 'YYYY-MM-DD'}` (righe nascoste con «Ok»; le
voci di giorni diversi da oggi decadono da sole). Le chiavi sono `fever`, `appt:<id>`, `feed:<t ultima pappa>`: una nuova pappa
o una nuova visita cambiano la chiave, quindi il promemoria ritorna anche se il precedente era stato nascosto.
Al massimo due righe, in quest'ordine di priorità: (1) **febbre** — temperatura ≥ 38 °C registrata nelle ultime 6 ore sotto i 90
giorni: ripete testualmente la prima bandiera rossa di Altro (`FEVER_TXT`, identica a index.html), colore `--danger`, senza
pulsanti e senza «Ok» (non ha interruttore e non si nasconde); (2) **visita** oggi o domani non ancora fatta (stessa regola di
`nextAppt`: anche passata da meno di 2 ore) con il titolo, il luogo e «Oggi/Domani alle HH:MM» a destra, colore `--c-sonno`, il
testo porta in Salute, «Ok» nasconde per oggi; (3) **pappa in ritardo** — `sinceFeedH − n.feedH > 0,5 h` (norma per età di §3), informazione neutra «Ultima pappa 4 h 10 fa, di solito ogni 3 h», colore `--c-fame`; non
compare oltre 12 h dall'ultima pappa (più probabile una registrazione mancante); il biberon rifiutato non vale come pappa.
La vitamina D non è più un promemoria: la sua riga sta sempre nella stessa scheda ed è di casa (app.js, §4), con «Segna».
Le regole si ricalcolano a ogni `renderHome` e sull'hook `change`; un `setInterval` di 60 s ridisegna solo se il testo delle
righe cambierebbe (solo la scheda con `API.renderNext` se cambia il testo, tutta la Home se compare o sparisce una riga; mai
durante un percorso). L'ora è iniettabile per i test: `AlanExt.reminders.compute(now)` restituisce le righe per quell'istante.
In Altro (slot `altro`, sopra Impostazioni) la card «Promemoria» ha due interruttori a tap (`role="switch"`, `aria-checked`):
Visite e Pappa in ritardo.

### 8.3 Pattern: la settimana, pappa, cacca (`js/stats.js`)
Slot `stats`: è tutto il contenuto della tab Pattern. Nessun dato proprio: calcoli sugli eventi esposti su `AlanExt.stats`
= {milkPerDay, feedTimes, histogram, usual, diapersPerDay, week} e ridisegnati a ogni `renderStats`. Tre schede, letture
fattuali e mai giudizi; senza dati ognuna mostra un testo di attesa. Marche sottili (barre ≤ 22 px con la cima arrotondata
di 4 px e la base piatta, linee 2 px, segmenti separati da 2 px di superficie), griglia solida e leggera, un'etichetta solo
su massimo, minimo e oggi, media come riga sottile con il valore a destra; ogni barra ha `<title>` (tooltip) e al tocco dice
il dettaglio con un toast.
1. **La settimana di Alan**: tre riquadri (pappe al giorno, ml al giorno, cacche al giorno) con la media dei giorni interi
   con qualcosa di registrato e una linea di andamento a 7 punti (l'ultimo punto vuoto = oggi in corso; i buchi restano
   buchi); sotto, la riga "Oggi" con pappe, ml e cacche di giornata.
2. **Pappa**. "Quando mangia": una riga per giorno (dal più vecchio a oggi) sulle 24 ore, le pappe come barrette alte in
   proporzione ai ml (rifiutata = quadratino vuoto), la notte 22–7 in ombra, un segno sull'ora attuale nella riga di oggi.
   Lettura: "di solito verso le 8, 11 e 14 · in media 6,5 pappe al giorno · una ogni 3 h 30" (intervallo medio fra pappe
   consecutive fra 30 min e 8 h). "Le ore delle pappe": profilo delle 24 ore sui 7 giorni (`histogram`, mezz'ore lisciate
   su 3) come area + linea, con i momenti abituali (`usual`: gruppi separati da salti > 1,5 h, giro di mezzanotte compreso,
   almeno 2 pappe e il 40% dei giorni con pappe) segnati da un punto con l'ora. "Quanto beve": ml al giorno, media sui
   giorni interi con almeno una pappa. Se ci sono rigurgiti, una riga con quanti e quanti entro 30 min da una pappa.
3. **Cacca**: un grafico a barre impilate, una barra per giorno, divisa per quantità (poca chiara, normale media, tanta
   piena; `lvlKey` normalizza i valori vecchi), media sui giorni interi. Le voci vecchie con `cacca: 'no'` non contano.
Decimali in italiano con la virgola; le ore abituali si scrivono con `fmtClock` (al mezz'ora: "8", "14:30").

### 8.4 Riepilogo per il pediatra (`js/report.js`)
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
biberon, intervallo medio fra pappe consecutive (solo intervalli fra 30 min e 8 h), biberon rifiutati; Cacca = al giorno e le quantità
poca / normale / tanta; Temperature = elenco dal primo giorno del
periodo a adesso, più recente in alto, con la più alta; Medicine = per nome, quante volte e l'ultima; Visite e vaccini = fatte
(done, dal primo giorno del periodo) e in programma (non fatte, da adesso, massimo 5); Note = le note dei genitori sulle voci
del periodo (§8.7), in ordine di tempo, con la voce e chi le ha scritte.
In fondo "Stampa o salva PDF" (`window.print()`; la classe `rp-print` su `<body>`, messa da `AlanExt.report.print()` e tolta ad
`afterprint`, attiva il CSS di stampa: nero su bianco, A4 con margini 16 mm, solo `#screenInner`; stampare da un'altra schermata
resta come prima) e "Condividi come testo" (`navigator.share` del testo, altrimenti appunti, altrimenti toast). Il riepilogo
aperto si ridisegna a ogni `change` (salvataggio o merge dall'altro telefono). `open(days, now)` accetta un istante facoltativo
solo per i test. Nessun giudizio: i numeri sono quelli del diario, e la nota a piè di pagina lo dice. Limiti: nella PWA
installata su iPhone `window.print()` può non aprire nulla (il pulsante mostra un toast che rimanda a "Condividi come testo"); da
Safari la stampa funziona e da lì si sceglie "Salva in File"/PDF; stampando dal menu di Safari senza passare dal pulsante il CSS
di stampa non si attiva. Le curve OMS restano quelle dei maschi (`js/who.js`).

### 8.5 Svezzamento (`js/svezzamento.js`)
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

### 8.6 Momenti (`js/momenti.js`, tab "Momenti")
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

### 8.7 Note sulle voci (`js/note.js`)
Una nota libera (≤ 200 caratteri, spazi e a capo normalizzati) su qualsiasi voce del diario tranne le visite e le voci nascoste;
vive sulla voce (`note`, `noteBy` = nome del profilo di chi scrive) e passa da `touched` + `save`, quindi si sincronizza come
la voce. Dove: in Oggi ogni riga del diario è toccabile sulla descrizione (`row` dell'API: `.row.tap`, target ≥ 44 px) e mostra
la nota sotto, con "— nome" solo se chi ha scritto è diverso da chi ha registrato; finché non esiste nessuna nota un
suggerimento in fondo al diario e, sempre, il pulsante "Tutto il diario" (`home` in `#extBottom`), che apre il percorso
`diario`: tutte le voci giorno per giorno (Oggi, Ieri, poi la data), 7 giornate alla volta con "Giorni precedenti" finché
esistono voci più vecchie, tap su una voce → percorso `note`, anche a distanza di giorni. In Salute la scheda "Note" elenca
le ultime 20 note dalla più recente ("e altre N" oltre) e "Scrivi una nota nel diario" apre lo stesso percorso `diario`. Il percorso `note` mostra la voce, una textarea con contatore, "Salva la nota" e,
se esiste, "Togli la nota"; salva con `A.finish('save'|'clear')` (il `finish` dell'estensione aggiorna la voce e torna
`false`, così app.js non crea una voce nuova); testo uguale → "Nessuna modifica". Il riepilogo per il pediatra (§8.4) aggiunge
la sezione "Note" (data, ora, voce · testo, chi) con le note del periodo, riportate così come sono. Nessun consiglio.
Esposto su `AlanExt.note` = {text, has, clean, set, all, recent(now, days), older, open, openDiary, more, typed, card}.

### 8.8 Rumore bianco (`js/noise.js`)
Suono per la nanna generato nel telefono, senza file e senza rete. **Curva "Ventilatore"** (id `video`): `CURVE_VIDEO`, livello
in dB a 1/6 di ottava da 20 Hz a 20 kHz, misurato dalla registrazione del video usato da Fabio e Ilaria (rumore gaussiano
stazionario, due canali indipendenti, piatto fino a ~1 kHz con una gobba a 500–800 Hz, taglio netto sopra 1 kHz e discesa
fino a 16 kHz); la risintesi differisce dal video di meno di 0,2 dB per terzo d'ottava. Varianti: Ventilatore scuro (−3 dB/ott
sopra 200 Hz), Ventilatore chiaro (+4 dB/ott sopra 1 kHz), Rosa (−3 dB/ott) e Marrone (−6 dB/ott) con la stessa chiusura
sopra 16 kHz. **Sintesi**: spettro con le ampiezze della curva (interpolazione in log f) e fasi casuali, simmetria hermitiana,
IFFT radix-2 in place; tre lunghezze d'anello (`LEVELS` = 2^14, 2^18, 2^20 campioni a 44,1 kHz: 0,37 s, 5,9 s, 23,8 s), rumore
gaussiano con loop circolare perfetto, RMS normalizzato, un canale per lato. `ensure(type, livello)` non scende mai di livello.
**Riproduzione (Web Audio)**: un solo `AudioContext` creato nel tap; `master` (GainNode, volume) → uscita; ogni suono è una
"voce" = `AudioBufferSourceNode` in loop (gapless per costruzione) con il suo GainNode. Cambio di voce (anteprima → lunga,
suono → suono) in dissolvenza incrociata di 0,4 s, la vecchia si ferma dopo; volume con `setTargetAtTime` sul master, senza
ricodifiche né riavvii; Stop = dissolvenza di 0,15 s. **Livelli**: `BASE_DB` −15 dBFS RMS (il livello misurato nel video) +
`VOL_DB[livello−1]` = −16/−10/−5/0/+3 dB; il livello 4 è l'originale a parità di volume del telefono; sotto i livelli la riga
`volText` (dB rispetto all'originale) con l'invito a misurare una volta con un'app fonometro. **Avvio (l'ordine che iPadOS pretende)**, tutto sincrono dentro il tocco: (1) `keepalive()` — un `<audio loop playsinline>`
con 1 s di rumore a −90 dB (uno o due LSB: inudibile, ma per iOS è riproduzione vera, e il silenzio assoluto non basta a
tenere viva la sessione); (2) `unlock()` — una sorgente muta di un campione fatta partire subito: è così che iOS sblocca il
contesto; (3) `resume()`; (4) la voce con l'anello già pronto, a freddo quello corto (sintesi istantanea, nessuna attesa nel
gesto). Poi `upgrade()` sale di un livello per volta (250 ms, poi 700 ms) in dissolvenza. Senza questo ordine, su iPad al
primo avvio il contesto restava sospeso e il suono partiva solo rientrando nell'app.
**Sblocco in anticipo** (`prime`): il primo tocco nell'app, qualunque esso sia (`touchstart`/`pointerdown`/`click` in cattura,
una volta sola), crea il contesto, fa partire la sorgente muta e chiama `resume()`. È il gesto più presto disponibile e non
contiene altro: quando poi si tocca Avvia il motore è già sbloccato. I tocchi successivi sono altre occasioni per riprenderlo.
**Controllo che stia suonando** (`watch`, a 300/700/1200/2000/3000 ms): la prova non è lo stato del contesto (su iOS può dire
`running` con la sessione audio ferma) ma `flowing()` = stato `running` **e** orologio del contesto che avanza. Finché non
suona si richiama `resume()`; a 1,2 s si passa al lettore (`useElement`).
**Ripiego sul lettore** (`mode` = 'el'): lo stesso `<audio>` della tenuta cambia sorgente e suona il file dell'anello al
volume scelto (iOS ignora `audio.volume`, quindi il volume sta nel file e cambiarlo rigenera il blob). L'elemento è già
sbloccato dal tocco, quindi riparte anche fuori dal gesto. Si sente un piccolo stacco a ogni giro dell'anello, e la schermata
lo spiega. Appena `flowing()` torna vero (controllo periodico, `visibilitychange`, nuovo Avvia) si torna all'anello continuo
(`useEngine`). Su `visibilitychange` e `statechange` il contesto sospeso viene ripreso. La Media Session porta titolo, play/pause/stop e `playbackState`; la pausa dal sistema ferma tutto. Timer (30 min, 1, 2, 8 h) controllato ogni 15 s e su `timeupdate` del
keepalive. `play()` e il contesto nascono nel tap: il tap su un suono o su un livello lo fa partire subito (anteprima), la
versione lunga si genera 0,7 s dopo in sottofondo (`upgrade`, annullato da Stop o da un altro cambio); `prewarm` prepara il suono salvato già lungo 4 s dopo
l'avvio, e si rimanda di 8 s se la pagina non è in primo piano (la sintesi occupa il telefono e non deve capitare mentre si
tocca Avvia); la schermata si ridisegna a ogni tap (`refresh`). Senza `AudioContext` un toast.
Stato in localStorage `alan.noise` = {type, vol, timer}, solo locale. UI: riga in Home (blocco `mid`, testo → schermata,
Avvia/Stop) e schermata `noise` (Avvia/Stop grande, 5 suoni, 5 livelli, timer, nota AAP su distanza ≥ 2 m e ≤ 50 dB).
Esposto su `AlanExt.noise` = {curveOf, fft, synth(type, logN, fs, rand), wav, gainDb, gainLin, state, setType, setVol, setTimer,
start, stop, toggle, isPlaying, isBlocked, unlock, watch, endAt, check, render, refresh, summary, status, volText, prewarm,
ensure, context, voice, keep}.
