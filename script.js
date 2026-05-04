(function () {
  const introView = document.getElementById("intro-view");
  const sampleView = document.getElementById("sample-view");
  const doneView = document.getElementById("done-view");
  const sampleContainer = document.getElementById("sample-container");
  const beginBtn = document.getElementById("begin-btn");
  const nextBtn = document.getElementById("next-btn");
  const quitBtn = document.getElementById("quit-btn");
  const progCurrent = document.getElementById("prog-current");
  const progTotal = document.getElementById("prog-total");
  const progCompleted = document.getElementById("prog-completed");
  const progFill = document.getElementById("prog-fill");
  const sampleError = document.getElementById("sample-error");
  const doneMessage = document.getElementById("done-message");

  function makeRespondentId() {
    if (window.crypto && crypto.randomUUID) {
      return "r_" + crypto.randomUUID().slice(0, 8);
    }
    return "r_" + Math.random().toString(36).slice(2, 10);
  }
  const respondentId = makeRespondentId();

  const allSamples = window.SAMPLES || [];
  const question = window.QUESTION_TEXT || "Which sample do you prefer?";
  const randomize = !!window.RANDOMIZE_AB;
  const submitUrl = window.SUBMIT_URL || "";
  const perSession = Number(window.SAMPLES_PER_SESSION) || 0;
  const oursName = window.OURS_NAME || "ours";

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pickSubset(arr, n) {
    if (!n || n >= arr.length) return shuffle(arr);
    return shuffle(arr).slice(0, n);
  }

  function assignOpponents(samplesList) {
    const out = [];
    let cycle = [];
    for (let i = 0; i < samplesList.length; i++) {
      const available = Object.keys(samplesList[i].competitors || {});
      if (available.length === 0) { out.push(null); continue; }
      if (cycle.length === 0) cycle = shuffle(available);
      let opp = null;
      while (cycle.length > 0) {
        const next = cycle.shift();
        if (available.indexOf(next) !== -1) { opp = next; break; }
      }
      if (opp === null) opp = available[Math.floor(Math.random() * available.length)];
      out.push(opp);
    }
    return out;
  }

  const samples = pickSubset(allSamples, perSession);
  const opponents = assignOpponents(samples);
  const swapFlags = samples.map(() => (randomize ? Math.random() < 0.5 : false));
  const responses = [];
  const submitPromises = [];
  let currentIdx = 0;

  progTotal.textContent = String(samples.length);

  beginBtn.addEventListener("click", () => {
    introView.classList.add("hidden");
    sampleView.classList.remove("hidden");
    renderSample(0);
  });

  nextBtn.addEventListener("click", () => {
    const r = collectCurrentResponse();
    if (!r) {
      sampleError.classList.remove("hidden");
      return;
    }
    sampleError.classList.add("hidden");
    responses.push(r);
    submitResponse(r);
    if (currentIdx + 1 >= samples.length) {
      finish();
    } else {
      currentIdx++;
      renderSample(currentIdx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  quitBtn.addEventListener("click", () => {
    const r = collectCurrentResponse();
    if (r) {
      responses.push(r);
      submitResponse(r);
    }
    finish();
  });

  function renderSample(i) {
    const sample = samples[i];
    const opponent = opponents[i];
    const swap = swapFlags[i];
    const oursPath = sample.ours;
    const opponentPath = sample.competitors[opponent];
    const firstClip = swap ? opponentPath : oursPath;
    const secondClip = swap ? oursPath : opponentPath;

    sampleContainer.innerHTML = `
      <section class="sample" data-sample-id="${sample.id}">
        <p class="question">${question}</p>
        <div class="audio-grid">
          <div class="audio-cell reference">
            <div class="label">Reference &mdash; Speaker 1</div>
            <audio controls preload="none" src="${sample.reference1}">
              Your browser does not support the audio element.
            </audio>
          </div>
          <div class="audio-cell reference">
            <div class="label">Reference &mdash; Speaker 2</div>
            <audio controls preload="none" src="${sample.reference2}">
              Your browser does not support the audio element.
            </audio>
          </div>
          <div class="audio-cell generated">
            <div class="label">Generated (a)</div>
            <audio controls preload="none" src="${firstClip}">
              Your browser does not support the audio element.
            </audio>
          </div>
          <div class="audio-cell generated">
            <div class="label">Generated (b)</div>
            <audio controls preload="none" src="${secondClip}">
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
        <div class="choices" role="radiogroup" aria-label="Choose between a and b">
          <label>
            <input type="radio" name="choice" value="a" />
            <span>(a) is better</span>
          </label>
          <label>
            <input type="radio" name="choice" value="b" />
            <span>(b) is better</span>
          </label>
          <label>
            <input type="radio" name="choice" value="tie" />
            <span>About the same</span>
          </label>
        </div>
      </section>
    `;

    progCurrent.textContent = String(i + 1);
    progCompleted.textContent = String(i);
    const pct = samples.length === 0 ? 0 : (i / samples.length) * 100;
    progFill.style.width = pct + "%";
    nextBtn.textContent = (i + 1 === samples.length) ? "Finish" : "Next sample →";
  }

  function collectCurrentResponse() {
    const radios = document.getElementsByName("choice");
    let chosen = null;
    for (const r of radios) if (r.checked) { chosen = r.value; break; }
    if (!chosen) return null;
    const swap = swapFlags[currentIdx];
    const oursSide = swap ? "b" : "a";
    const opponent = opponents[currentIdx];
    const modelA = oursSide === "a" ? oursName : opponent;
    const modelB = oursSide === "b" ? oursName : opponent;
    const winner =
      chosen === "tie" ? "tie" : (chosen === oursSide ? "ours" : "opponent");
    const chosenModel =
      winner === "tie" ? "tie" : (winner === "ours" ? oursName : opponent);
    return {
      sample_id: samples[currentIdx].id,
      index: currentIdx,
      opponent: opponent,
      ours_side: oursSide,
      model_a: modelA,
      model_b: modelB,
      choice: chosen,
      winner: winner,
      chosen_model: chosenModel,
    };
  }

  function submitResponse(r) {
    if (!submitUrl) {
      r._sent = false;
      return Promise.resolve();
    }
    const payload = {
      respondent_id: respondentId,
      submitted_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      responses: [{
        sample_id: r.sample_id,
        index: r.index,
        opponent: r.opponent,
        ours_side: r.ours_side,
        model_a: r.model_a,
        model_b: r.model_b,
        choice: r.choice,
        winner: r.winner,
        chosen_model: r.chosen_model,
      }],
    };
    const p = (async () => {
      try {
        const res = await fetch(submitUrl, {
          method: "POST",
          mode: "cors",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Server returned " + res.status);
        r._sent = true;
      } catch (err) {
        console.error(err);
        r._sent = false;
      }
    })();
    submitPromises.push(p);
    return p;
  }

  async function retryUnsent(unsent) {
    const payload = {
      respondent_id: respondentId,
      submitted_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      responses: unsent.map(r => ({
        sample_id: r.sample_id,
        index: r.index,
        opponent: r.opponent,
        ours_side: r.ours_side,
        model_a: r.model_a,
        model_b: r.model_b,
        choice: r.choice,
        winner: r.winner,
        chosen_model: r.chosen_model,
      })),
    };
    const res = await fetch(submitUrl, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Server returned " + res.status);
    unsent.forEach(r => { r._sent = true; });
  }

  function downloadResponses() {
    const payload = {
      respondent_id: respondentId,
      submitted_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      responses,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eval_" + respondentId + "_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function finish() {
    sampleView.classList.add("hidden");
    doneView.classList.remove("hidden");
    progFill.style.width = "100%";

    if (responses.length === 0) {
      doneMessage.textContent = "No responses to submit. Thanks for stopping by!";
      return;
    }

    if (!submitUrl) {
      downloadResponses();
      doneMessage.textContent =
        "Downloaded your " + responses.length +
        " responses — please send the JSON to the organizer.";
      return;
    }

    doneMessage.textContent = "Saving your responses…";
    await Promise.all(submitPromises);

    const unsent = responses.filter(r => !r._sent);
    if (unsent.length > 0) {
      try {
        await retryUnsent(unsent);
      } catch (err) {
        console.error(err);
      }
    }

    const sent = responses.filter(r => r._sent).length;
    const failed = responses.length - sent;
    if (failed === 0) {
      doneMessage.textContent =
        "Recorded your " + sent + " response" + (sent === 1 ? "" : "s") +
        ". Thanks for listening!";
    } else {
      doneMessage.textContent =
        "Saved " + sent + " of " + responses.length +
        " responses; " + failed + " could not be submitted. Please contact the organizer.";
    }
  }
})();
