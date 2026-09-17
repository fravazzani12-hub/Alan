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

## 2. Modello dati (evento = oggetto piatto, `id` client-side, `t` epoch ms, `k` tipo, `who` chi, `_updated` ISO UTC dell'ultima modifica)
| k | campi | note |
|---|---|---|
| feed | prep (ml preparati), ml (ml bevuti, scelti a tap a passi di 10, 0 ≤ ml ≤ prep; 0 = biberon rifiutato) | una pappa con ml = 0 non conta come ultima pappa, non entra nel tipico e non etichetta un pianto |
| diaper | pipi (no/poca/tanta), cacca (no/poca/tanta) | |
| sleep / wake | — | stato sonno = ultimo dei due |
| other | what (ruttino/massaggio/ciuccio/coccole/passeggiata/bagnetto) | mappa su causa aria o contatto |
| cry | dur (s), label (fame/sonno/cambio/aria/contatto/solo/null), bins {f,a,h}, ctx (snapshot), feat {vec[12], meanF0, sdF0, meanRms, bursts10, meanBurst, meanPause, voiced, cent, durS}, audio (bool, **solo locale**), mime, cloud (nome oggetto nel bucket, es. `<id>.m4a`) | audio in IndexedDB, chiave = id, valore `{buf: ArrayBuffer, mime}` (i Blob in IndexedDB su iOS sono fragili; i vecchi Blob restano leggibili) |

Impostazioni: `settings {name, birth (YYYY-MM-DD), _updated}`.

Locale: IndexedDB `alan-v2` (store `kv` → `state` JSON, store `audio` → `{buf,mime}`), mirror in localStorage `alan.v2`.
Code offline in localStorage: `alan.outbox` (voci), `alan.audio.outbox` (id dei pianti con audio da caricare), `alan.settings.outbox`.
Diagnostica in localStorage `alan.diag`.

Remoto (opzionale, `supabase/schema.sql`):
- tabella `events`: `data` jsonb contiene tutti i campi tranne id/t/k/who/audio; soft delete con `deleted`; conflitti risolti per
  `updated_at` (last-writer-wins). La cancellazione porta `updated_at` = momento della cancellazione, così il pull incrementale
  dell'altro telefono la vede anche se ha perso il messaggio realtime.
- tabella `family_settings`: una riga per famiglia (name, birth, updated_at), stesso last-writer-wins; se il server è vuoto vincono le impostazioni locali.
- bucket privato `cries`: un oggetto per pianto in `<family_id>/<id>.<ext>`; upload subito dopo il salvataggio (o alla prossima
  rete), download al primo ascolto sull'altro telefono (poi resta in IndexedDB), rimozione quando il pianto è cancellato.
- Sync (`js/sync.js`, supabase-js 2.49.4 UMD): pull incrementale per `updated_at` a pagine da 1000; canale realtime
  `family-<id>` con `postgres_changes` su events e family_settings + presence (chi è collegato adesso); risottoscrizione con
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
- intervallo pappe atteso: <6 → 3 h, <12 → 3,5 h, else 4 h. Ridotto ×0,75 se l'ultima pappa < 70% della tipica; inoltre ×0,7 se ml/prep < 0,4, ×0,85 se < 0,7.
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

## 8. Roadmap
1. Pulsante "Piange" anche dalla lock screen: shortcut iOS che apre l'URL `?cry=1` → l'app parte già in registrazione.
2. Notifica "è ora della pappa?" quando sinceFeed supera l'atteso (Web Push richiede iOS 16.4+ e PWA installata).
3. Esportazione CSV del diario.
4. Se il suono si dimostra informativo: sostituire il k-NN con regressione logistica sui 12 feature + contesto (sempre con LOO).
