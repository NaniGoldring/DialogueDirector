# Audio Generation Human Evaluation

A static, GitHub-Pages-friendly listening-test page modeled on
[`majoroth/salmon_human_eval`](https://majoroth.github.io/salmon_human_eval/),
adapted to show **4 audio samples per question**: two references and two
generated samples (a and b) the listener has to choose between.

## File layout

```
salmon_eval_poll/
├── index.html      # main page (intro + form)
├── style.css       # styling
├── samples.js      # YOU EDIT THIS — list of questions / audio paths
├── script.js       # rendering + submission logic
└── audio/
    ├── sample_01/
    │   ├── ref1.wav
    │   ├── ref2.wav
    │   ├── gen_a.wav
    │   └── gen_b.wav
    ├── sample_02/
    └── …
```

## Adding your samples

1. Drop your `.wav` / `.mp3` files into `audio/<sample_id>/`. Any folder
   structure works — only the paths in `samples.js` matter.
2. Open `samples.js` and add one entry per question:

   ```js
   {
     id: "sample_07",
     reference1: "audio/sample_07/ref1.wav",
     reference2: "audio/sample_07/ref2.wav",
     generated_a: "audio/sample_07/model_X.wav",
     generated_b: "audio/sample_07/model_Y.wav",
   },
   ```

3. (Optional) Edit `QUESTION_TEXT` to change the prompt shown under each
   sample.

4. `RANDOMIZE_AB = true` shuffles which generated clip appears as (a) vs
   (b) per session, so listeners can't tell which model is which. The
   submitted payload always records the *original* identity from
   `samples.js`, plus a flag indicating whether the UI was swapped.

## Collecting responses

`SUBMIT_URL` in `samples.js` controls what happens on submit:

- **Empty string** (default): the page generates a JSON file and triggers
  a download — listeners email it back to you. Zero infrastructure.
- **Google Apps Script Web App URL**: POSTs the JSON to a Google Sheet.
  See "Sheet backend" below.
- **Any custom HTTPS endpoint**: receives a JSON POST with the schema
  shown in the next section.

### Submission payload

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "submitted_at": "2026-05-03T09:30:00.000Z",
  "user_agent": "Mozilla/5.0 …",
  "responses": [
    {
      "sample_id": "sample_01",
      "index": 0,
      "choice": "a",                 // "a" | "b" | "tie"
      "ab_was_swapped_in_ui": false  // true => UI showed gen_b as (a)
    }
  ]
}
```

### Sheet backend (optional)

1. Create a Google Sheet, then `Extensions → Apps Script`.
2. Paste the snippet below, deploy as a Web App with
   "Execute as: me" and "Who has access: Anyone".
3. Copy the deployment URL into `SUBMIT_URL` in `samples.js`.

```js
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  data.responses.forEach(r => {
    sheet.appendRow([
      data.submitted_at,
      data.name,
      data.email,
      r.sample_id,
      r.choice,
      r.ab_was_swapped_in_ui,
    ]);
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Hosting on GitHub Pages

```bash
git init
git add .
git commit -m "Initial listening test"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

In the repo settings → Pages, set the source to `main` / `/ (root)`.
Your test will be live at `https://<you>.github.io/<repo>/`.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
(Browsers won't load `<audio src="audio/...">` from a `file://` URL, so a
local server is required for testing.)
