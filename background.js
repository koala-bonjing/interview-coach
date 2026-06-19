// Background service worker. The only place that talks to the Anthropic API.
// Content scripts and the popup send a runtime message; this worker does the
// fetch (with the "bring your own key" header) and returns parsed JSON.

const DEFAULT_MODEL = "claude-sonnet-4-6";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "EVALUATE") {
    handleEvaluate(msg.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: "unexpected_error", detail: String(err) }));
    return true; // keep the message channel open for the async response
  }
  if (msg && msg.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }
});

async function handleEvaluate(payload) {
  const settings = await chrome.storage.local.get(["apiKey", "model"]);
  if (!settings.apiKey) {
    return { error: "missing_api_key" };
  }

  const model = settings.model || DEFAULT_MODEL;
  const prompt = buildPrompt(payload);

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });
  } catch (networkErr) {
    return { error: "network_error", detail: String(networkErr) };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { error: `api_error_${res.status}`, detail };
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  const raw = textBlock ? textBlock.text : "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return { result: JSON.parse(cleaned) };
  } catch {
    return { error: "parse_error", raw };
  }
}

function buildPrompt(payload) {
  const { question, transcript, metrics, mode } = payload;

  const metricsBlock = metrics
    ? `Precomputed delivery metrics (trust these numbers, don't recompute them):
- Word count: ${metrics.wordCount}
- Duration: ${metrics.durationSec}s
- Pace: ${metrics.wpmValue} words/min
- Filler words used: ${metrics.fillerTotal} (${JSON.stringify(metrics.fillerBreakdown || {})})
- Longest pause: ${metrics.longestPauseSec ?? "n/a"}s`
    : "No delivery metrics were provided for this evaluation.";

  const contextLine =
    mode === "live"
      ? "This is a snippet captured live during an actual video interview, so be encouraging but honest — the person can't redo this answer."
      : "This is a solo practice attempt, so be direct and specific about what to improve.";

  return `You are an interview coach evaluating one spoken answer. ${contextLine}

Interview question (may be blank if not captured): "${question || "(not provided)"}"

Candidate's transcribed answer:
"""
${transcript}
"""

${metricsBlock}

Score the answer on CONTENT (relevance, structure, specificity, whether it actually answers the question) and on DELIVERY (pacing, filler words, clarity — use the precomputed metrics above rather than guessing).

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "contentScore": <integer 0-10>,
  "deliveryScore": <integer 0-10>,
  "strengths": [<1-3 short strings>],
  "improvements": [<1-3 short, specific, actionable strings>],
  "paceNote": <short string about pacing using the precomputed wpm>,
  "fillerNote": <short string about filler word usage using the precomputed count>,
  "summary": <one or two sentence overall takeaway>
}`;
}
