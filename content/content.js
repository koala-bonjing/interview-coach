// Live mode overlay. Injected into Meet / Zoom / Teams tabs.
// Transcribes the user's OWN microphone via the Web Speech API (it cannot
// hear the other participant — see README for why) and surfaces live
// pacing/filler-word stats, with an on-demand AI evaluation per answer.

(function () {
  const STATE = {
    listening: false,
    chunks: [], // { text, timestamp }
    settings: { fillerWords: "", paceLow: 130, paceHigh: 160 },
    recognition: null,
    expanded: false
  };

  chrome.storage.local.get(["fillerWords", "paceLow", "paceHigh"], (s) => {
    STATE.settings.fillerWords = s.fillerWords || "";
    STATE.settings.paceLow = s.paceLow || 130;
    STATE.settings.paceHigh = s.paceHigh || 160;
  });

  // ---------- UI ----------
  const root = document.createElement("div");
  root.id = "ic-root";
  root.innerHTML = `
    <div id="ic-bubble" title="Interview Coach">
      <span id="ic-dot"></span><span id="ic-bubble-label">Coach</span>
    </div>
    <div id="ic-panel" hidden>
      <div id="ic-header">
        <span>Interview Coach — Live</span>
        <div>
          <button id="ic-collapse" title="Minimize">_</button>
        </div>
      </div>
      <div id="ic-body">
        <input id="ic-question" type="text" placeholder="What did they just ask? (optional, improves feedback)" />
        <div id="ic-controls">
          <button id="ic-toggle">Start listening</button>
          <button id="ic-reset">New session</button>
        </div>
        <div id="ic-stats">
          <div><span id="ic-wpm">0</span> wpm</div>
          <div><span id="ic-fillers">0</span> fillers</div>
          <div><span id="ic-words">0</span> words</div>
        </div>
        <div id="ic-turns"></div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const bubble = root.querySelector("#ic-bubble");
  const panel = root.querySelector("#ic-panel");
  const dot = root.querySelector("#ic-dot");
  const toggleBtn = root.querySelector("#ic-toggle");
  const resetBtn = root.querySelector("#ic-reset");
  const collapseBtn = root.querySelector("#ic-collapse");
  const questionInput = root.querySelector("#ic-question");
  const wpmEl = root.querySelector("#ic-wpm");
  const fillersEl = root.querySelector("#ic-fillers");
  const wordsEl = root.querySelector("#ic-words");
  const turnsEl = root.querySelector("#ic-turns");

  bubble.addEventListener("click", () => setExpanded(true));
  collapseBtn.addEventListener("click", () => setExpanded(false));

  function setExpanded(val) {
    STATE.expanded = val;
    panel.hidden = !val;
    bubble.hidden = val;
  }

  // Simple drag support on the bubble.
  (function makeDraggable(el) {
    let startX, startY, origX, origY, dragging = false;
    el.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = root.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      root.style.left = `${origX + dx}px`;
      root.style.top = `${origY + dy}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => (dragging = false));
  })(bubble);

  // ---------- Speech recognition ----------
  function getRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) STATE.chunks.push({ text, timestamp: Date.now() });
        }
      }
      render();
    };
    rec.onerror = (e) => {
      console.warn("[Interview Coach] speech recognition error", e.error);
    };
    rec.onend = () => {
      if (STATE.listening) {
        // Chrome stops recognition after pauses of silence — restart it.
        try { rec.start(); } catch { /* already starting */ }
      }
    };
    return rec;
  }

  toggleBtn.addEventListener("click", () => {
    if (!STATE.listening) {
      const rec = getRecognition();
      if (!rec) {
        alert("This browser doesn't support live speech recognition. Use Chrome.");
        return;
      }
      STATE.recognition = rec;
      STATE.listening = true;
      rec.start();
      toggleBtn.textContent = "Stop listening";
      dot.classList.add("ic-live");
    } else {
      STATE.listening = false;
      if (STATE.recognition) STATE.recognition.stop();
      toggleBtn.textContent = "Start listening";
      dot.classList.remove("ic-live");
    }
  });

  resetBtn.addEventListener("click", () => {
    STATE.chunks = [];
    render();
  });

  // ---------- Live stats + turn rendering ----------
  function render() {
    const turns = ICAnalysis.segmentIntoTurns(STATE.chunks);
    const fillerList = ICAnalysis.getFillerList(STATE.settings.fillerWords);
    const fullText = STATE.chunks.map((c) => c.text).join(" ");
    const totalWords = ICAnalysis.wordCount(fullText);
    const { total: fillerTotal } = ICAnalysis.countFillers(fullText, fillerList);

    const firstTs = STATE.chunks[0]?.timestamp;
    const lastTs = STATE.chunks[STATE.chunks.length - 1]?.timestamp;
    const elapsedSec = firstTs && lastTs ? (lastTs - firstTs) / 1000 : 0;
    const overallWpm = ICAnalysis.wpm(totalWords, elapsedSec);

    wpmEl.textContent = overallWpm;
    fillersEl.textContent = fillerTotal;
    wordsEl.textContent = totalWords;

    turnsEl.innerHTML = "";
    turns
      .slice(-6)
      .reverse()
      .forEach((turn, idx) => {
        const realIndex = turns.length - 1 - idx;
        const card = document.createElement("div");
        card.className = "ic-turn";
        const turnWpm = ICAnalysis.wpm(ICAnalysis.wordCount(turn.text), turn.durationSec);
        const { total: turnFillers, breakdown } = ICAnalysis.countFillers(turn.text, fillerList);
        card.innerHTML = `
          <div class="ic-turn-text">${escapeHtml(truncate(turn.text, 140))}</div>
          <div class="ic-turn-meta">${turnWpm} wpm · ${turnFillers} fillers · ${Math.round(turn.durationSec)}s</div>
          <button class="ic-eval-btn" data-idx="${realIndex}">Evaluate this answer</button>
          <div class="ic-feedback" hidden></div>
        `;
        const btn = card.querySelector(".ic-eval-btn");
        const feedbackBox = card.querySelector(".ic-feedback");
        btn.addEventListener("click", () => {
          btn.disabled = true;
          btn.textContent = "Evaluating…";
          chrome.runtime.sendMessage(
            {
              type: "EVALUATE",
              payload: {
                mode: "live",
                question: questionInput.value.trim(),
                transcript: turn.text,
                metrics: {
                  wordCount: ICAnalysis.wordCount(turn.text),
                  durationSec: Math.round(turn.durationSec),
                  wpmValue: turnWpm,
                  fillerTotal: turnFillers,
                  fillerBreakdown: breakdown,
                  longestPauseSec: Math.round(turn.longestPauseSec)
                }
              }
            },
            (response) => {
              btn.disabled = false;
              btn.textContent = "Evaluate this answer";
              renderFeedback(feedbackBox, response);
            }
          );
        });
        turnsEl.appendChild(card);
      });
  }

  function renderFeedback(box, response) {
    box.hidden = false;
    if (!response || response.error === "missing_api_key") {
      box.innerHTML = `<div class="ic-error">Add your Anthropic API key in the extension's Options page first.</div>`;
      return;
    }
    if (response.error) {
      box.innerHTML = `<div class="ic-error">Couldn't get feedback (${escapeHtml(response.error)}).</div>`;
      return;
    }
    const r = response.result;
    box.innerHTML = `
      <div class="ic-scores">Content ${r.contentScore}/10 · Delivery ${r.deliveryScore}/10</div>
      <div class="ic-summary">${escapeHtml(r.summary)}</div>
      <ul class="ic-list">${(r.improvements || []).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    `;
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  render();
  setInterval(render, 1000);
})();
