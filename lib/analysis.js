// Shared analysis helpers. Loaded as a plain script (no modules) so it can be
// included identically by the content script, the popup, and the options page.
// Exposes everything on the global `ICAnalysis` namespace.

(function (global) {
  const DEFAULT_FILLERS = [
    "um", "uh", "uhh", "umm", "like", "you know", "sort of", "kind of",
    "basically", "actually", "literally", "right", "so yeah", "i mean"
  ];

  function getFillerList(customCsv) {
    if (!customCsv) return DEFAULT_FILLERS;
    const custom = customCsv
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    return custom.length ? custom : DEFAULT_FILLERS;
  }

  // Counts filler word occurrences in a transcript. Returns total + per-word breakdown.
  function countFillers(transcript, fillerList) {
    const text = ` ${transcript.toLowerCase()} `;
    const breakdown = {};
    let total = 0;
    for (const filler of fillerList) {
      const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<=\\W)${escaped}(?=\\W)`, "g");
      const matches = text.match(re);
      const count = matches ? matches.length : 0;
      if (count > 0) {
        breakdown[filler] = count;
        total += count;
      }
    }
    return { total, breakdown };
  }

  // Words per minute given a word count and elapsed seconds.
  function wpm(wordCount, seconds) {
    if (!seconds || seconds <= 0) return 0;
    return Math.round((wordCount / seconds) * 60);
  }

  function wordCount(transcript) {
    return (transcript.trim().match(/\S+/g) || []).length;
  }

  // Given a list of {text, timestamp} speech-result chunks, group consecutive
  // chunks into "turns" whenever the gap between chunks exceeds pauseGapMs.
  // Returns turns as { text, startTime, endTime, durationSec, longestPauseSec }.
  function segmentIntoTurns(chunks, pauseGapMs = 2500) {
    const turns = [];
    let current = null;
    let longestGapInTurn = 0;

    for (const chunk of chunks) {
      if (!current) {
        current = { text: chunk.text, startTime: chunk.timestamp, endTime: chunk.timestamp };
        longestGapInTurn = 0;
        continue;
      }
      const gap = chunk.timestamp - current.endTime;
      if (gap > pauseGapMs) {
        turns.push({
          text: current.text.trim(),
          startTime: current.startTime,
          endTime: current.endTime,
          durationSec: (current.endTime - current.startTime) / 1000,
          longestPauseSec: longestGapInTurn / 1000
        });
        current = { text: chunk.text, startTime: chunk.timestamp, endTime: chunk.timestamp };
        longestGapInTurn = 0;
      } else {
        current.text += " " + chunk.text;
        current.endTime = chunk.timestamp;
        if (gap > longestGapInTurn) longestGapInTurn = gap;
      }
    }
    if (current) {
      turns.push({
        text: current.text.trim(),
        startTime: current.startTime,
        endTime: current.endTime,
        durationSec: (current.endTime - current.startTime) / 1000,
        longestPauseSec: longestGapInTurn / 1000
      });
    }
    return turns;
  }

  function paceLabel(rate, targetLow = 130, targetHigh = 160) {
    if (rate === 0) return "—";
    if (rate < targetLow - 20) return "slow";
    if (rate < targetLow) return "a bit slow";
    if (rate <= targetHigh) return "good pace";
    if (rate <= targetHigh + 25) return "a bit fast";
    return "fast";
  }

  global.ICAnalysis = {
    DEFAULT_FILLERS,
    getFillerList,
    countFillers,
    wpm,
    wordCount,
    segmentIntoTurns,
    paceLabel
  };
})(typeof window !== "undefined" ? window : globalThis);
