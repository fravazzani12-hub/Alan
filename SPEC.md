# SPEC — Alan, cosa vuole?

Requisiti dichiarati dal committente (Fabio), scelte fatte, e come funziona il motore. Questo file è la fonte di verità
per chi sviluppa (umano o Claude Code).

## 1. Requisiti
1. Inserimento **solo a tap**: nessun valore da digitare. I ml preparati si scelgono tra valori fissi o con stepper ±10; i ml bevuti si scelgono tra i valori da 0 a prep a passi di 10 (quantità precise, mai "poco"/"metà").
2. Home = scelta di cosa registrare (Pappa, Pannolino, Nanna, Altro) → domande una alla volta, ogni tap avanza, l'ultimo tap salva.
3. **Registrare il pianto di ogni azione**: prima di addormentarsi, prima di mangiare, ecc. L'app deve ricordare gli audio e
   ricollegare quello che sta ascoltando alle informazioni che ha per dare un giudizio.
4. Due genitori (Fabio e Ilaria) con i dati allineati tra i telefoni.
5. Onestà sul risultato: l'app deve misurare da sola quanto ci azzecca, non fingere di tradurre.

## 2. Modello dati (evento = oggetto piatto, `id` client-side, `t` epoch ms, `k` tipo, `who` chi)
| k | campi | note |
|---|---|---|
| feed | prep (ml preparati), ml (ml bevuti, scelti a tap a passi di 10, 0 ≤ ml ≤ prep; 0 = biberon rifiutato) | una pappa con ml = 0 non conta come ultima pappa e non etichetta un pianto |
| diaper | pipi (no/poca/tanta), cacca (no/poca/tanta) | |
| sleep / wake | — | stato sonno = ultimo dei due |
| other | what (ruttino/massaggio/ciuccio/coccole/passeggiata/bagnetto) | mappa su causa aria o contatto |
| cry | dur (s), label (fame/sonno/cambio/aria/contatto/solo/null), bins {f,a,h}, ctx (snapshot), feat {vec[12], …}, audio (bool: copia locale), mime, audioPath (percorso nel bucket Storage `cries`), rec {mime, bytes, frames, err} diagnostica | audio in IndexedDB come {buf, mime}; copia in cloud caricata appena c'è la famiglia; download on-demand sull'altro telefono |

Locale: IndexedDB `alan-v2` (store `kv` → `state` JSON, store `audio` → Blob), mirror in localStorage `alan.v2`.
Remoto (opzionale): tabella `events` (vedi `supabase/schema.sql`): `data` jsonb contiene tutti i campi tranne id/t/k/who;
soft delete con `deleted`; conflitti risolti per `updated_at` (last-writer-wins). Sync: pull incrementale per `updated_at`,
realtime su `postgres_changes`, outbox in localStorage per l'offline. Auth: email + password (utenti creati in dashboard), nessun flusso email. `who` = nome dal profilo dell'utente loggato (user_metadata.name), non selezionabile. Presenza: Realtime Presence sul canale della famiglia; l'intestazione mostra ogni genitore con pallino verde se ha l'app aperta.

## 3. Etichettatura dei pianti
- Un pianto salvato resta "aperto" (`openCry`). La prima azione registrata con `t` in [cry.t − 5 min, cry.t + 45 min] gli
  assegna la label: feed→fame, sleep→sonno, diaper→cambio, other→aria|contatto. `wake` non etichetta.
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

### 4.5 Voto acustico e fusione
- k-NN (k=5) su vec z-scorato sui pianti etichettati con feat, peso 1/(d+0,35), smoothing 2%.
- Peso del suono w = min(0,6; n/(n+12))·calib; calib = 0,5 se n<8, altrimenti clamp((acc_suono − acc_caso)/0,3; 0; 1).
- p_finale ∝ p_contesto^(1−w) · p_suono^w.
- Precisione = leave-one-out su tutti i pianti etichettati: contesto, suono, insieme, e baseline "causa più frequente".

## 5. UI
- Font Atkinson Hyperlegible; palette light/dark via `prefers-color-scheme`; tap target ≥ 44 px; percorsi a schermo intero.
- Colori causa: fame #D9962A, sonno #5B73D9, cambio #2E9E6E, aria #B266A6, contatto #D96A5C; accento #F0B040.
- Le tavole di riferimento sono nel canvas Design "Alan — cosa vuole? · schermate".

## 6. Roadmap
1. ~~Audio condiviso~~ fatto: bucket `cries`, upload dopo il salvataggio, download on-demand.
2. Pulsante "Piange" anche dalla lock screen: shortcut iOS che apre l'URL `?cry=1` → l'app parte già in registrazione.
3. Notifica "è ora della pappa?" quando sinceFeed supera l'atteso (Web Push richiede iOS 16.4+ e PWA installata).
4. Esportazione CSV del diario.
5. Se il suono si dimostra informativo: sostituire il k-NN con regressione logistica sui 12 feature + contesto (sempre con LOO).
