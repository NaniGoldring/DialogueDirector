# CoVoMix2 Human-Evaluation 20-Prompt Set

This package contains 20 multi-speaker dialogues with reference audio and 5 system outputs each (4 baselines + 1 ours), plus auto-computed metrics for reference.

## Contents

```
human_eval20/
├── README.md                  this file
├── manifest.json              all 20 items with paths + speaker prompt transcriptions
├── transcripts/               20 dialogue scripts (one .txt per dialogue, alternating speakers per line)
├── refs/                      reference audio (40 files: 20 dialogues × 2 speakers)
│                              named <key>_spk1.<ext> and <key>_spk2.<ext>
├── outputs/
│   ├── ours_abs_10k/          20 wavs (volume-normalized to baseline mean RMS)
│   ├── zipvoice_dialog/       20 wavs
│   ├── moss_ttsd/             20 wavs
│   ├── vibevoice_7b/          20 wavs
│   └── dia/                   20 wavs
├── metrics_summary.csv        aggregate metrics per system (auto, for reference)
└── metrics_per_item.csv       per-item metrics (auto, for reference)
```

## Item structure

- 20 dialogue keys, sorted: 032, 044, 049, 104, 120, 129, 142, 162, 226, 237 (LibriSpeech refs);
  259, 319, 499, 641, 686, 721, 758, 795, 798, 951 (hard "in-the-wild" refs).
- Each dialogue has a script (alternating S1/S2 lines) and 2 prompt audio files.
- The 5 systems each produced one wav per dialogue. Same dialogue, same refs, different model.

## Reference sources

- **LibriSpeech (clean)**: 10 dialogues with refs from LibriSpeech `test-clean` (read-aloud literature, studio quality, mostly mono prose).
- **Hard refs (in-the-wild)**: 10 dialogues with refs scraped from real-world short videos
  (extracted to mono 16 kHz wav). Background noise, music bleed, vocal styles vary.

## Systems

- **ours_abs_10k**: Our model (abs-positional, 10k training steps; 20s training horizon).
- **zipvoice_dialog**: ZipVoice-Dialog (k2-fsa). Default zipvoice_dialog config, gs=1.5, 16 steps.
- **moss_ttsd**: MOSS-TTSD v1.0 (OpenMOSS-Team).
- **vibevoice_7b**: VibeVoice-Large 7B (microsoft → aoi-ot/VibeVoice-Large).
- **dia**: Dia 1.6B (nari-labs/Dia-1.6B-0626).

## Suggested human-evaluation protocol

For each dialogue, present (in randomized order) the 5 system outputs along with
the 2 reference prompts and the dialogue script. Ask listeners to rate (e.g. on a 1–5
scale):

1. **Naturalness** — Does it sound like a natural dialogue?
2. **Speaker similarity** — Does each speaker match the corresponding reference?
3. **Speaker switching** — Are speaker turns clear and consistent across the dialogue?
4. **Audio quality** — Is the audio clean, free from artifacts/glitches?
5. **Prosody / expressiveness** — Is the prosody appropriate for the dialogue?

Tip: Anonymize system names before showing to listeners (e.g. `system_A.wav` ... `system_E.wav`).
A simple shuffle script is provided below.

## Anonymization snippet (Python)

```python
import json, random, shutil
from pathlib import Path

random.seed(42)
SYSTEMS = ["ours_abs_10k", "zipvoice_dialog", "moss_ttsd", "vibevoice_7b", "dia"]
LETTERS = ["A","B","C","D","E"]
m = json.loads(Path("manifest.json").read_text())

key_map = {}  # {dialogue_key: {letter: system}}
for it in m:
    perm = LETTERS[:]; random.shuffle(perm)
    key_map[it["key"]] = dict(zip(perm, SYSTEMS))

# Make outputs/anon/ with letters
out_anon = Path("outputs_anon"); out_anon.mkdir(exist_ok=True)
for k, mapping in key_map.items():
    for letter, sys in mapping.items():
        shutil.copy2(f"outputs/{sys}/{k}.wav", out_anon / f"{k}_{letter}.wav")

Path("anon_key.json").write_text(json.dumps(key_map, indent=2))
print("wrote outputs_anon/ and anon_key.json")
```

## Auto-metrics (for reference, NOT for human eval)

`metrics_summary.csv` and `metrics_per_item.csv` give automatic metrics from MultiRefEval:
- **WER / cpWER** — transcription error rate (faster-whisper-large-v3 ASR; cpWER is speaker-permutation-aware via pyannote diarization).
- **SIM-O / cpSIM** — speaker similarity (WavLM-ECAPA-TDNN embeddings vs prompts).
- **UTMOS** — naturalness MOS prediction.
- **ACC** — MOSS-TTSD-style speaker-attribution accuracy (per-word).

These don't replace human eval but are useful as a sanity check.

## Volume note

`ours_abs_10k` outputs were attenuated by **−5.93 dB** to match the mean RMS of the 4 baselines
(was +5.93 dB louder before). This was a global gain only — relative dynamics within each clip preserved.
