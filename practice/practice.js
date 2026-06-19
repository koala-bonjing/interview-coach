const state = {
  category: "behavioral",
  question: "",
  recognition: null,
  recording: false,
  chunks: [], // { text, timestamp }
  startTime: null,
  endTime: null,
  timerInterval: null,
  settings: { fillerWords: "", paceLow: 130, paceHigh: 160 }
};

const els = {
  category: document.getElementById("category"),
  questionText: document.getElementById("question-text"),
  newQuestion: document.getElementById("new-question"),
  transcript: document.getElementById("transcript"),
  timer: document.getElementById("timer"),
  recordToggle: document.getElementById("record-toggle"),
  getFeedback: document.getElementById("get-feedback"),
  apiWarning: document.getElementById("api-warning"),
  feedbackPanel: document.getElementById("feedback-panel"),
  feedbackBody: document.getElementById("feedback-body"),
  historyList: document.getElementById("history-list"),
  clearHistory: document.getElementById("clear-history"),
  openOptions: document.getElementById("open-options")
};

init();

function init() {
  ICQuestions.getCategories().forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat.replace(/_/g, " ");
    els.category.appendChild(opt);
  });
  els.category.value = state.category;

  chrome.storage.local.get(["apiKey", "fillerWords", "paceLow", "paceHigh"], (s) => {
    state.settings.fillerWords = s.fillerWords || "";
    state.settings.paceLow = s.paceLow || 130;
    state.settings.paceHigh = s.paceHigh || 160;
    els.apiWarning.hidden = !!s.apiKey;
  });

  els.category.addEventListener("change", () => (state.category = els.category.value));
  els.newQuestion.addEventListener("click", pickNewQuestion);
  els.recordToggle.addEventListener("click", toggleRecording);
  els.getFeedback.addEventListener("click", requestFeedback);
  els.clearHistory.addEventListener("click", clearHistory);
  els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

  renderHistory();
}

function pickNewQuestion() {
  state.question = ICQuestions.getRandomQuestion(state.category);
  els.questionText.textContent = state.question;
  resetAnswer();
}

function resetAnswer() {
  state.chunks = [];
  state.startTime = null;
  state.endTime = null;
  els.transcript.textContent = "Your transcribed answer will appear here as you speak.";
  els.timer.textContent = "00:00";
  els.getFeedback.disabled = true;
  els.feedbackPanel.hidden = true;
  if (state.recording) stopRecording();
}

function toggleRecording() {
  if (!state.question) {
    alert("Pick a question first.");
    return;
  }
  state.recording ? stopRecording() : startRecording();
}

function startRecording() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert("This browser doesn't support live speech recognition. Use Chrome.");
    return;
  }
  state.chunks = [];
  state.startTime = Date.now();
  els.transcript.textContent = "";

  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = "en-US";
  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        const text = event.results[i][0].transcript.trim();
        if (text) {
          state.chunks.push({ text, timestamp: Date.now() });
          els.transcript.textContent = state.chunks.map((c) => c.text).join(" ");
        }
      }
    }
  };
  rec.onend = () => {
    if (state.recording) {
      try { rec.start(); } catch { /* restart race, ignore */ }
    }
  };
  rec.onerror = (e) => console.warn("[Interview Coach] recognition error", e.error);

  state.recognition = rec;
  state.recording = true;
  rec.start();

  els.recordToggle.textContent = "Stop recording";
  els.recordToggle.classList.add("ic-recording");
  els.getFeedback.disabled = true;

  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    els.timer.textContent = formatTime(elapsed);
  }, 500);
}

function stopRecording() {
  state.recording = false;
  state.endTime = Date.now();
  if (state.recognition) state.recognition.stop();
  clearInterval(state.timerInterval);

  els.recordToggle.textContent = "Start recording";
  els.recordToggle.classList.remove("ic-recording");
  els.getFeedback.disabled = state.chunks.length === 0;
}

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function requestFeedback() {
  const transcript = state.chunks.map((c) => c.text).join(" ").trim();
  if (!transcript) return;

  const fillerList = ICAnalysis.getFillerList(state.settings.fillerWords);
  const { total: fillerTotal, breakdown } = ICAnalysis.countFillers(transcript, fillerList);
  const durationSec = Math.round(((state.endTime || Date.now()) - state.startTime) / 1000);
  const wordCount = ICAnalysis.wordCount(transcript);
  const wpmValue = ICAnalysis.wpm(wordCount, durationSec);

  els.getFeedback.disabled = true;
  els.getFeedback.textContent = "Evaluating…";

  chrome.runtime.sendMessage(
    {
      type: "EVALUATE",
      payload: {
        mode: "practice",
        question: state.question,
        transcript,
        metrics: { wordCount, durationSec, wpmValue, fillerTotal, fillerBreakdown: breakdown }
      }
    },
    (response) => {
      els.getFeedback.disabled = false;
      els.getFeedback.textContent = "Get feedback";
      renderFeedback(response, { wordCount, durationSec, wpmValue, fillerTotal });
    }
  );
}

function renderFeedback(response, metrics) {
  els.feedbackPanel.hidden = false;
  if (!response || response.error === "missing_api_key") {
    els.feedbackBody.innerHTML = `<p class="ic-warn">Add your Anthropic API key in Settings to get AI feedback.</p>`;
    return;
  }
  if (response.error) {
    els.feedbackBody.innerHTML = `<p class="ic-warn">Couldn't get feedback (${escapeHtml(response.error)}). Check Settings or try again.</p>`;
    return;
  }
  const r = response.result;
  els.feedbackBody.innerHTML = `
    <div class="ic-scores">Content ${r.contentScore}/10 · Delivery ${r.deliveryScore}/10</div>
    <div class="ic-summary">${escapeHtml(r.summary)}</div>
    <h3>Strengths</h3>
    <ul>${(r.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    <h3>Improve</h3>
    <ul>${(r.improvements || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    <div class="ic-meta-row">
      <span>${metrics.wpmValue} wpm</span>
      <span>${metrics.fillerTotal} fillers</span>
      <span>${metrics.wordCount} words</span>
      <span>${metrics.durationSec}s</span>
    </div>
  `;
  saveToHistory(r, metrics);
}

function saveToHistory(result, metrics) {
  chrome.storage.local.get(["history"], (s) => {
    const history = s.history || [];
    history.unshift({
      date: new Date().toISOString(),
      category: state.category,
      question: state.question,
      contentScore: result.contentScore,
      deliveryScore: result.deliveryScore,
      summary: result.summary,
      metrics
    });
    chrome.storage.local.set({ history: history.slice(0, 50) }, renderHistory);
  });
}

function renderHistory() {
  chrome.storage.local.get(["history"], (s) => {
    const history = s.history || [];
    if (!history.length) {
      els.historyList.innerHTML = `<p class="ic-history-empty">No attempts yet — your past evaluations will show up here.</p>`;
      return;
    }
    els.historyList.innerHTML = history
      .map(
        (h) => `
        <div class="ic-history-item">
          <div class="hi-top"><span>${new Date(h.date).toLocaleString()}</span><span>${h.contentScore}/10 content · ${h.deliveryScore}/10 delivery</span></div>
          <div class="hi-q">${escapeHtml(h.question)}</div>
        </div>`
      )
      .join("");
  });
}

function clearHistory() {
  if (!confirm("Clear all saved practice history?")) return;
  chrome.storage.local.set({ history: [] }, renderHistory);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
