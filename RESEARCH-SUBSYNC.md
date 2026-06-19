# Cercetare: Sincronizare Subtitrări cu Audio în www2video

> **Data:** 2026-06-19
> **Context:** www2video folosește Vertex AI Gemini 3.1 Flash TTS Preview.
> Audio e returnat ca PCM Int16 @ 24kHz, convertit în WAV. Subtitrările sunt div-uri overlay
> animate cu GSAP, cu timing alocat proporțional pe baza numărului de caractere.

---

## 1. Problema Curentă

În `server/src/routes/video.js` (liniile 438–498), subtitrările sunt generate astfel:

```js
const sentences = narrationText.split(/(?<=[.!?])\s+/);
const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);

sentences.forEach((sentence, i) => {
  const ratio = totalChars > 0 ? sentence.length / totalChars : 1 / sentences.length;
  const sentenceDuration = Math.max(duration * ratio, 0.5);
  const start = prevEnd;
  const end = Math.min(start + sentenceDuration, duration);
  prevEnd = end;
  // ... creează div-uri subtitle + animații GSAP
});
```

**Probleme:**
- Durata totală a subtitrărilor e forțată să fie `duration` (parametru video), dar audio-ul real poate fi mai scurt sau mai lung.
- Alocarea proporțională pe caractere ignoră complet ritmul real al vorbirii (silabe, pauze, intonație).
- Nu există niciun feedback de timing din partea API-ului TTS.

---

## 2. Metode de Măsurare a Duratei Reale a WAV-ului

### 2.1. Citirea Header-ului WAV (Node.js, fără dependențe)

WAV header standard are 44 de bytes. Câmpurile relevante:

| Offset | Dimensiune | Câmp | Valoare (www2video) |
|--------|-----------|------|---------------------|
| 24     | 4 bytes   | `sampleRate` | 24000 |
| 34     | 2 bytes   | `bitsPerSample` | 16 |
| 22     | 2 bytes   | `numChannels` | 1 |
| 40     | 4 bytes   | `subchunk2Size` (data chunk size) | PCM bytes |

**Formula duratei:**
```
numSamples = subchunk2Size / (bitsPerSample / 8 * numChannels)
           = subchunk2Size / (16/8 * 1)
           = subchunk2Size / 2
duration = numSamples / sampleRate
         = numSamples / 24000
```

**Implementare în Node.js (0 dependențe):**

```js
function getWavDuration(wavBuffer) {
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const numChannels = wavBuffer.readUInt16LE(22);
  const dataSize = wavBuffer.readUInt32LE(40);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataSize / (bytesPerSample * numChannels);
  return numSamples / sampleRate;
}
```

Alternativ, cu `wav-file-info` (npm) sau `wavefile` (npm), dar nu e necesar.

### 2.2. Alternativă Python (pentru validare)

```python
import wave
with wave.open('narration.wav', 'rb') as wf:
    frames = wf.getnframes()
    rate = wf.getframerate()
    duration = frames / rate
    print(f"Durata reală: {duration:.2f}s")
```

---

## 3. Spargerea Textului în Bucăți Mici cu Audio per Segment

### 3.1. Abordarea

1. Split text în propoziții (deja se face).
2. Pentru fiecare propoziție, apelează `generateTTS(sentence)` individual.
3. Măsoară durata reală a fiecărui WAV generat.
4. Concatenează toate WAV-urile într-un singur fișier audio final.
5. Folosește duratele măsurate pentru timing-ul subtitrărilor.

### 3.2. Implementare

```js
// video.js — generateInBackground
if (options.useSubtitles && narrationText.trim()) {
  const sentences = narrationText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Generează audio per propoziție
  const audioSegments = [];
  for (const sentence of sentences) {
    const audioBuf = await generateTTS(sentence, voiceName);
    audioSegments.push({
      text: sentence,
      buffer: audioBuf,
      duration: getWavDuration(audioBuf),
    });
  }

  // Concatenează WAV-urile (doar data chunks, plus header pentru total)
  const concatenatedWav = concatWavs(audioSegments.map(s => s.buffer));
  const totalAudioDuration = audioSegments.reduce((sum, s) => sum + s.duration, 0);

  // Timing precis pentru subtitrări
  let prevEnd = 0;
  audioSegments.forEach((seg, i) => {
    const start = prevEnd;
    const end = prevEnd + seg.duration;
    prevEnd = end;
    // Creează subtitrare cu start/end precise
  });
}
```

### 3.3. Concatenare WAV

```js
function concatWavs(wavBuffers) {
  const dataChunks = wavBuffers.map(b => b.slice(44)); // skip headers
  const totalDataLen = dataChunks.reduce((s, b) => s + b.length, 0);
  // Creează header nou cu dimensiunea totală
  const headerBuf = wavBuffers[0].slice(0, 44);
  headerBuf.writeUInt32LE(36 + totalDataLen, 4);  // RIFF size
  headerBuf.writeUInt32LE(totalDataLen, 40);       // data chunk size
  return Buffer.concat([headerBuf, ...dataChunks]);
}
```

### 3.4. Avantaje și Dezavantaje

| Avantaje | Dezavantaje |
|----------|-------------|
| Timing perfect per propoziție | **N APELURI API** în loc de 1 (cost ×N, latență ×N) |
| Pauze naturale între propoziții | Poate suna nenatural (ton inconsistent între apeluri) |
| Ușor de implementat | Rate limiting (Vertex AI are limite de requesturi) |
| Nu necesită schimbare de API | Concatenarea poate introduce clicuri/artefacte la granițe |

---

## 4. Alternativa: TTS cu Word-Level Timestamps

### 4.1. Gemini TTS (generateContent API) — NU suportă timestamps

API-ul `gemini-3.1-flash-tts-preview:generateContent` returnază doar:
- `candidates[0].content.parts[0].inlineData.data` (base64 PCM)

**Nu există** niciun câmp pentru timestamps, timepoints, sau word-level timing în răspuns.
Nici `speechConfig` nu are opțiuni pentru a cere timestamps.

**Concluzie:** Cu acest API, nu poți obține timestamps direct.

### 4.2. Traditional Google Cloud TTS API (text:synthesize v1beta1) — Suportă SSML marks

API-ul REST `https://texttospeech.googleapis.com/v1beta1/text:synthesize` suportă:

- **SSML `<mark>` tags** — plasezi markeri în text:
  ```xml
  <speak>
    <mark name="s0"/>Prima propoziție.<mark name="s1"/>
    A doua propoziție.<mark name="s2"/>
  </speak>
  ```
- **`enableTimePointing: ["SSML_MARK"]`** — cere timestamp-urile în răspuns.
- **Răspuns** include `timepoints[]` cu `{ markName, timeSeconds }`.

**Avantaje:**
- Un singur API call pentru întreg textul.
- Timestamps precise pentru fiecare `<mark>`.
- Voce consistentă (același apel).

**Dezavantaje:**
- **API diferit** — nu mai e Gemini TTS, ci traditional Cloud TTS.
- Calitatea vocii poate fi diferită (Wavenet/Neural2 vs Gemini).
- Gemeni suportă >70 limbi; traditional TTS poate avea suport diferit pentru română.
- Necesită SSML generation wrapper.

**Verificare suport română:** Traditional Google Cloud TTS suportă `ro-RO` cu voci precum `ro-RO-Standard-A`, `ro-RO-Wavenet-A`, `ro-RO-Neural2-A` etc.

### 4.3. Comparație: Gemini TTS vs Traditional Cloud TTS

| Caracteristică | Gemini TTS (actual) | Traditional TTS v1beta1 |
|---------------|-------------------|----------------------|
| API endpoint | `generateContent` | `text:synthesize` |
| Răspuns | PCM audio | MP3/Linear16 audio + timepoints |
| Timestamps | ❌ Nu | ✅ Da (SSML marks) |
| Voci (ro) | Toate vocile Gemini | Standard/Wavenet/Neural2 |
| Preț | ~$1/M tokens in, $20/M out | ~$4-16/1M chars (în funcție de model) |
| SSML | ❌ Nu | ✅ Da |
| Emoții/Stil | ✅ Gemeni (prompt steering) | ❌ Limitat |

---

## 5. Analiza codului cursuri-romana

### 5.1. Proiectul folosește același API Gemini TTS

```
PROJECT_ID = 'gen-lang-client-0575393893'  // ACEEAȘI
MODEL = 'gemini-3.1-flash-tts-preview'      // ACELAȘI
```

- `generateSpeech()` → apelează `callVertexAI(TTS_MODEL, contents, { responseModalities: ['AUDIO'], speechConfig })` → returnează PCM Buffer
- `pcmToWav()` → identic cu www2video
- Are și streaming: `generateSpeechStream()` → `streamGenerateContent?alt=sse` → yield PCM chunks
- **Nu există** nicio analiză de durată sau sincronizare subtitrări în cod.
- TTS cache pe disc (hash MD5) și în DB — evită re-generarea aceluiași text.

### 5.2. Diferențe față de www2video

| Aspect | cursuri-romana | www2video |
|--------|---------------|-----------|
| Streaming TTS | Da (`/tts/stream` SSE) | Nu |
| Cache TTS | Da (MD5 hash + DB) | Nu |
| Subtitrări | Nu există | GSAP overlays în HTML |
| Sincronizare | Nu e cazul (doar redare audio) | Problemă centrală |
| Autentificare | `GoogleAuth` library | Manual JWT |
| Limbaj | RO/EN/VI/NE/HI/SI/BN | RO (forțat) |

---

## 6. Abordarea Recomandată (Best Approach)

### Abordare hibridă pe 3 niveluri, implementată progresiv:

---

### Nivelul 1: 🔧 Măsurare Reală (Quick Win)

**Ce:** După generarea TTS, citește header-ul WAV și ajustează `duration` la durata reală.

**Implementare:**
```js
// După generateTTS + writeFile
const actualDuration = getWavDuration(audioBuffer);
// Folosește actualDuration în loc de options.duration la alocarea subtitrărilor
```

**Avantaje:** 
- Trivial de implementat (< 10 linii)
- Rezolvă problema majoră: subtitrările nu mai sar sau nu mai rămân în urmă
- Zero cost suplimentar

**Dezavantaje:**
- Tot proporțional pe caractere în interior
- Nu rezolvă timing-ul per-propoziție

**Complexitate:** Foarte mică. Timp: ~15 minute.

---

### Nivelul 2: 🔬 Per-Sentence TTS (Precision)

**Ce:** După măsurare, generează audio separat pentru fiecare propoziție și măsoară durata reală.

**Implementare:**
- Split text în propoziții
- Pentru fiecare: `generateTTS(sentence)` → măsoară durata
- Concatenează WAV-urile
- Timing exact per subtitrare

**Avantaje:**
- Sincronizare perfectă per propoziție
- Pauze naturale între propoziții
- Rezolvă complet problema

**Dezavantaje:**
- N apeluri API (cost: sumă caractere per apel ≈ același, dar overhead per request)
- Latență: N × ~500ms-2s
- Poate suna ușor diferit per apel (variații subtile de ton)
- Rate limiting Vertex AI

**Mitigare rate limiting:** Găsește limita de RPM pentru `gemini-3.1-flash-tts-preview` pe proiect și adaugă `setTimeout` între apeluri. Alternativ, folosește `Promise.all` cu max 3-5 concurente.

**Complexitate:** Medie. Timp: ~2-3 ore.

---

### Nivelul 3: 🏆 Google Cloud TTS cu SSML Marks (Optimal)

**Ce:** Switch la API-ul traditional TTS v1beta1 cu SSML marks pentru timestamps precise într-un singur call.

**Implementare:**
```js
// Generează SSML cu <mark> tags
const ssml = `<speak>
  <mark name="s0"/>${escapeXml(sentences[0])}<mark name="s1"/>
  <mark name="s1"/>${escapeXml(sentences[1])}<mark name="s2"/>
  ...
</speak>`;

// Apelează texttospeech.googleapis.com/v1beta1/text:synthesize
// cu enableTimePointing: ["SSML_MARK"]

// Răspunsul conține:
// - audioContent (base64 MP3 sau Linear16)
// - timepoints: [{ markName: "s0", timeSeconds: 0.0 }, { markName: "s1", timeSeconds: 2.5 }, ...]
```

**Avantaje:**
- Un singur API call
- Voce 100% consistentă
- Timestamps precise pentru fiecare propoziție
- Suport SSML (pauze ` <break time="500ms"/> `, pronunție, etc.)

**Dezavantaje:**
- **API total diferit** — necesită refactor al serviciului TTS
- Calitatea vocii poate fi diferită (Neural2 vs Gemini)
- Unele voci Gemini (ex: Kore, Puck) nu există în traditional TTS
- Preț potențial mai mare
- Testare necesară pentru calitate română

**Complexitate:** Mare. Timp: ~4-8 ore.

---

### Matricea Decizională

| Abordare | Precizie | Cost API | Latență | Efort | Menține Gemini? |
|----------|----------|----------|---------|-------|-----------------|
| **Nivel 1** (măsurare) | Scăzută | Același | Aceeași | ~15 min | ✅ Da |
| **Nivel 2** (per-sentence) | Foarte bună | ×N requests | ×N mai mare | ~2-3 ore | ✅ Da |
| **Nivel 3** (SSML marks) | Perfectă | Același | Aceeași | ~4-8 ore | ❌ Nu (alt API) |
| Hibrid N1+N2 | Excelentă | ×N requests | ×N mai mare | ~2-3 ore | ✅ Da |

---

### Recomandare Finală

1. **Imediat (astăzi):** Implementează **Nivelul 1** — măsurarea duratei reale WAV.
   - Ajustează `duration` în funcție de durata reală a audio-ului.
   - Rezolvă 80% din problemă (subtitrările nu mai sar/nu rămân în urmă).

2. **Pe termen scurt (săptămâna asta):** Implementează **Nivelul 2** — per-sentence TTS.
   - Păstrează API-ul Gemini actual.
   - Generează audio per propoziție, măsoară, concatenează.
   - Adaugă caching (MD5 hash) ca în cursuri-romana.

3. **Pe termen lung:** Explorează **Nivelul 3** dacă:
   - Calitatea vocii traditional TTS pentru română e acceptabilă.
   - Ai nevoie de cuvinte per-cuvânt (word-level) nu doar per-propoziție.
   - Costul actual e o problemă (Gemini TTS e mai scump la output).

---

## 7. Cod Demonstrativ — Nivelul 1 (Măsurare WAV)

```js
// Adaugă în tts.js
export function getWavDuration(wavBuffer) {
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const numChannels = wavBuffer.readUInt16LE(22);
  const dataSize = wavBuffer.readUInt32LE(40);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataSize / (bytesPerSample * numChannels);
  return numSamples / sampleRate;
}
```

```js
// În video.js, după generateTTS:
const audioResult = await generateTTS(narrationText, options.tts_voice || 'Kore');
const actualDuration = getWavDuration(Buffer.from(audioResult));
console.log(`[generate] TTS duration: ${actualDuration.toFixed(2)}s (requested: ${duration}s)`);

// Folosește actualDuration la alocarea subtitrărilor
```

---

## 8. Resurse

| Resursă | URL |
|---------|-----|
| Gemini TTS Docs | https://ai.google.dev/gemini-api/docs/speech-generation |
| Google Cloud TTS v1beta1 | https://cloud.google.com/text-to-speech/docs/reference/rest/v1beta1/text/synthesize |
| SSML Marks Timestamps | https://stackoverflow.com/questions/57381977/ |
| WAV Format Spec | http://soundfile.sapp.org/doc/WaveFormat/ |
| Node.js wavefile | https://www.npmjs.com/package/wavefile |

---

## Anexă: Schema Impactului Modificărilor

```
Actual:                                          Propus (Nivel 1+2):
┌──────────────┐                                 ┌──────────────┐
│  Narration   │                                 │  Narration   │
│  Text        │                                 │  Text        │
└──────┬───────┘                                 └──────┬───────┘
       ▼                                                ▼
┌──────────────┐                                 ┌──────────────────┐
│ 1× generate  │                                 │ N× generateTTS   │
│ TTS (full)   │                                 │ (per sentence)   │
└──────┬───────┘                                 └────────┬─────────┘
       ▼                                                   ▼
┌──────────────┐     ┌──────────────────┐         ┌──────────────────┐
│ WAV file     │────▶│ Alocare          │         │ N × WAV files   │
│ (durată      │     │ proporțională    │         │ (durate exacte)  │
│  necunoscută)│     │ caractere →      │         └────────┬─────────┘
└──────────────┘     │ timing inexact   │                  ▼
                     └──────────────────┘         ┌──────────────────┐
                                                  │ Concatenează     │
                                                  │ WAV + header     │
                                                  └────────┬─────────┘
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Subtitrări cu    │
                                                  │ timing EXACT     │
                                                  │ (măsurat, nu     │
                                                  │ estimat)         │
                                                  └──────────────────┘
```
