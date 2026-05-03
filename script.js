(function () {
  const samplesContainer = document.getElementById("samples");
  const form = document.getElementById("poll-form");
  const submitBtn = document.getElementById("submit-btn");
  const resultBox = document.getElementById("result");

  // Generate an anonymous, per-session respondent ID so all answers from
  // one listener can be grouped together in the Sheet.
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

  // Pick a random subset for this session (Fisher-Yates).
  function pickSubset(arr, n) {
    if (!n || n >= arr.length) return arr.slice();
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
  const samples = pickSubset(allSamples, perSession);

  // Per-question, decide whether (a) and (b) should be displayed swapped.
  // We always store the user's choice using the *original* a/b identity.
  const displayMap = samples.map(() => (randomize ? Math.random() < 0.5 : false));

  samples.forEach((sample, idx) => {
    const swap = displayMap[idx];
    const firstGen = swap ? sample.generated_b : sample.generated_a;
    const secondGen = swap ? sample.generated_a : sample.generated_b;
    const firstId = swap ? "b" : "a";
    const secondId = swap ? "a" : "b";

    const wrap = document.createElement("section");
    wrap.className = "sample";
    wrap.dataset.sampleId = sample.id;
    wrap.dataset.swap = swap ? "1" : "0";

    wrap.innerHTML = `
      <div class="sample-header">
        <h3>Sample ${idx + 1}</h3>
      </div>
      <p class="question">${question}</p>

      <div class="audio-grid">
        <div class="audio-cell reference">
          <div class="label">Reference 1</div>
          <audio controls preload="none" src="${sample.reference1}">
            Your browser does not support the audio element.
          </audio>
        </div>
        <div class="audio-cell reference">
          <div class="label">Reference 2</div>
          <audio controls preload="none" src="${sample.reference2}">
            Your browser does not support the audio element.
          </audio>
        </div>
        <div class="audio-cell generated">
          <div class="label">Generated (a)</div>
          <audio controls preload="none" src="${firstGen}">
            Your browser does not support the audio element.
          </audio>
        </div>
        <div class="audio-cell generated">
          <div class="label">Generated (b)</div>
          <audio controls preload="none" src="${secondGen}">
            Your browser does not support the audio element.
          </audio>
        </div>
      </div>

      <div class="choices" role="radiogroup" aria-label="Choose between a and b">
        <label>
          <input type="radio" name="choice_${idx}" value="${firstId}" required />
          <span>(a) is better</span>
        </label>
        <label>
          <input type="radio" name="choice_${idx}" value="${secondId}" required />
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
      responses.push({
        sample_id: sample.id,
        index: idx,
        choice: chosen,
        ab_was_swapped_in_ui: displayMap[idx],
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
        // Use text/plain to avoid the CORS preflight (OPTIONS) that Google
        // Apps Script web apps don't handle. The server parses it as JSON.
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
        // No backend configured -> let the user download their answers.
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
