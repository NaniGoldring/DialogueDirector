(function () {
  const samplesContainer = document.getElementById("samples");
  const form = document.getElementById("poll-form");
  const submitBtn = document.getElementById("submit-btn");
  const resultBox = document.getElementById("result");

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
  const samples = pickSubset(allSamples, perSession);

  // For each sample, decide which competitor `ours` is paired against.
  // Round-robin over a shuffled competitor order so a session of N questions
  // distributes opponents as evenly as possible across the 4 competitors.
  function assignOpponents(samplesList) {
    const out = [];
    let cycle = [];
    for (let i = 0; i < samplesList.length; i++) {
      const available = Object.keys(samplesList[i].competitors || {});
      if (available.length === 0) {
        out.push(null);
        continue;
      }
      // Refill the cycle whenever it's empty, with a fresh shuffle.
      if (cycle.length === 0) cycle = shuffle(available);
      // If the rotation hits a name this sample doesn't have, fall back.
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
  const opponents = assignOpponents(samples);

  // Per-question swap: which side `ours` sits on.
  const swapFlags = samples.map(() => (randomize ? Math.random() < 0.5 : false));

  samples.forEach((sample, idx) => {
    const opponent = opponents[idx];
    const opponentPath = sample.competitors[opponent];
    const oursPath = sample.ours;

    const swap = swapFlags[idx];
    // swap=false: (a) = ours, (b) = opponent
    // swap=true:  (a) = opponent, (b) = ours
    const firstClip = swap ? opponentPath : oursPath;
    const secondClip = swap ? oursPath : opponentPath;

    const wrap = document.createElement("section");
    wrap.className = "sample";
    wrap.dataset.sampleId = sample.id;
    wrap.dataset.opponent = opponent;
    wrap.dataset.swap = swap ? "1" : "0";

    wrap.innerHTML = `
      <div class="sample-header">
        <h3>Sample ${idx + 1}</h3>
      </div>
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
          <input type="radio" name="choice_${idx}" value="a" required />
          <span>(a) is better</span>
        </label>
        <label>
          <input type="radio" name="choice_${idx}" value="b" required />
          <span>(b) is better</span>
        </label>
        <label>
          <input type="radio" name="choice_${idx}" value="tie" />
          <span>About the same</span>
        </label>
      </div>
    `;
    samplesContainer.appendChild(wrap);
  });

  function clearMissingHighlights() {
    document.querySelectorAll(".sample.missing").forEach((el) => {
      el.classList.remove("missing");
    });
  }

  function showResult(message, kind) {
    resultBox.textContent = message;
    resultBox.className = `result ${kind || ""}`.trim();
    resultBox.classList.remove("hidden");
  }

  function deriveWinner(choice, swap) {
    if (choice === "tie") return "tie";
    const oursSide = swap ? "b" : "a";
    return choice === oursSide ? "ours" : "opponent";
  }

  function collectResponses() {
    const responses = [];
    let firstMissing = null;
    samples.forEach((sample, idx) => {
      const radios = document.getElementsByName(`choice_${idx}`);
      let chosen = null;
      for (const r of radios) {
        if (r.checked) { chosen = r.value; break; }
      }
      if (chosen === null && !firstMissing) {
        firstMissing = document.querySelector(
          `[data-sample-id="${sample.id}"]`
        );
      }
      const swap = swapFlags[idx];
      responses.push({
        sample_id: sample.id,
        index: idx,
        opponent: opponents[idx],
        ours_side: swap ? "b" : "a",
        choice: chosen,
        winner: chosen === null ? null : deriveWinner(chosen, swap),
      });
    });
    return { responses, firstMissing };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMissingHighlights();

    const { responses, firstMissing } = collectResponses();
    if (firstMissing) {
      firstMissing.classList.add("missing");
      firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
      showResult("Please answer every question before submitting.", "error");
      return;
    }

    const payload = {
      respondent_id: respondentId,
      submitted_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      responses,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      if (submitUrl) {
        const res = await fetch(submitUrl, {
          method: "POST",
          mode: "cors",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        showResult("Thank you! Your responses have been recorded.", "success");
        form.querySelectorAll("input").forEach((el) => (el.disabled = true));
      } else {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `eval_${respondentId}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showResult(
          "Thank you! A JSON file with your responses was downloaded — please send it back to the organizer.",
          "success"
        );
      }
    } catch (err) {
      console.error(err);
      showResult(
        "Something went wrong while submitting: " + err.message,
        "error"
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit responses";
    }
  });
})();
