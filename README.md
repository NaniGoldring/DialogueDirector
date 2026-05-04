# DialogueDirector — Human Evaluation

A static, GitHub-Pages-friendly listening test for comparing **our
dialogue-TTS model against four competitors** on the
[`human_eval20`](./human_eval20) sample set.

Live: https://nanigoldring.github.io/DialogueDirector/

## How it works

Each session is a one-sample-per-page wizard:

1. **Intro page** — instructions and a "Begin" button.
2. **Sample pages** — one at a time, each showing four clips:
   - **Reference — Speaker 1** (real recording of speaker 1)
   - **Reference — Speaker 2** (real recording of speaker 2)
   - **Generated (a)** and **Generated (b)** — the same dialogue rendered
     by two different TTS systems. One is always *ours*; the other is one
     of the four competitors. Their order is randomized per question so
     listeners can't tell which is which.

   The listener picks `(a) is better`, `(b) is better`, or `About the same`,
   then clicks **Next sample →**. **Quit and submit** ends early.

3. **Done page** — submits all answered questions in one POST.

A progress bar shows `Sample X of 10 · Y completed`. The default target
is 10 samples; that's set by `SAMPLES_PER_SESSION` in `samples.js`.

### Opponent rotation

The 4 competitors are `zipvoice_dialog`, `moss_ttsd`, `vibevoice_7b`, and
`dia` (defined in `samples.js`). For each session we shuffle that list
and round-robin through it as we walk the per-session sample subset, so
10 questions split as 3+3+2+2 across competitors — close to balanced
without making the rotation predictable.

## File layout

```
.
├── index.html         # 3-view SPA: intro / sample / done
├── style.css
├── script.js          # wizard logic + opponent rotation + submit
├── samples.js         # auto-generated from human_eval20/manifest.json
├── apps_script.gs     # Google Apps Script backend for the response sheet
└── human_eval20/
    ├── manifest.json
    ├── refs/<key>_spk{1,2}.{flac,wav}
    ├── outputs/
    │   ├── ours_abs_10k/<key>.wav        # ours
    │   ├── zipvoice_dialog/<key>.wav
    │   ├── moss_ttsd/<key>.wav
    │   ├── vibevoice_7b/<key>.wav
    │   └── dia/<key>.wav
    └── transcripts/<key>.txt
```

`samples.js` references files under `human_eval20/` directly — no copying
or symlinking. To swap in a different evaluation set, regenerate
`samples.js` so each entry has `reference1`, `reference2`, `ours`, and a
`competitors: { name: path }` map.

## Submission

`window.SUBMIT_URL` in `samples.js` controls the destination:

- **Empty string** → the browser downloads a JSON file with the
  responses; listeners email it back.
- **Google Apps Script Web App URL** (current default) → POSTs the JSON
  to a Google Sheet via the script in `apps_script.gs`.

### Payload

```jsonc
{
  "respondent_id": "r_abc12345",          // anonymous, per-session
  "submitted_at": "2026-05-04T13:41:55.000Z",
  "user_agent": "...",
  "responses": [
    {
      "sample_id": "032",
      "index": 0,
      "opponent": "moss_ttsd",            // which competitor "ours" faced
      "ours_side": "a",                   // "a" or "b" — which slot held ours
      "choice": "a",                      // raw user pick: "a" | "b" | "tie"
      "winner": "ours"                    // derived: "ours" | "opponent" | "tie"
    }
  ]
}
```

### Sheet backend

`apps_script.gs` is the script bound to the response Google Sheet.
Headers it writes per row:

```
submitted_at | respondent_id | sample_id | opponent | winner |
choice       | ours_side     | question_index       | user_agent
```

Setup is documented inline at the top of `apps_script.gs`. After editing,
re-deploy via *Manage deployments → pencil → New version* so the existing
`SUBMIT_URL` keeps working.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Browsers refuse `<audio src=...>` over `file://`, so a local HTTP server
is required for testing.

## Hosting on GitHub Pages

This repo is set up to serve from `main` / root. After pushing, the site
rebuilds automatically at the URL above.

The script tags in `index.html` use a `?v=N` cache-buster — bump it when
shipping a change that listeners with the old version cached should pick
up immediately.
