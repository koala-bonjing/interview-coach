// Question bank for Practice Mode. Plain global script, no build step needed.
(function (global) {
  const QUESTIONS = {
    behavioral: [
      "Tell me about a time you disagreed with a teammate's technical decision. What did you do?",
      "Describe a project that didn't go as planned. What happened and what did you learn?",
      "Tell me about a time you had to learn something completely new under a deadline.",
      "Give an example of feedback you received that was hard to hear. How did you respond?",
      "Tell me about a time you had to debug something with very little information to go on.",
      "Describe a situation where you had to push back on a request from a client or manager.",
      "Walk me through how you prioritize when you have more tasks than time."
    ],
    technical_web: [
      "Explain the difference between server components and client components in a framework like Next.js.",
      "How would you debug a React app that's re-rendering far more often than expected?",
      "Walk me through what happens, end to end, when a user submits a form on a modern web app.",
      "How do you decide what should live in global state versus component state?",
      "Explain how you'd structure database access in a full-stack app to avoid connection exhaustion under load.",
      "What's your approach to validating data that crosses the client/server boundary?",
      "How would you design a feature that lets users upload and preview images before saving them?"
    ],
    system_design_lite: [
      "How would you design a simple job board where companies post listings and users apply?",
      "Walk me through how you'd add a notifications feature to an existing app.",
      "How would you design a file-export feature that needs to handle large datasets without timing out?",
      "How would you structure a multi-tenant app where each company only sees its own data?"
    ],
    resume_based: [
      "Walk me through a project on your resume you're most proud of, and why.",
      "What was the hardest technical problem you solved in your most recent project?",
      "Why did you choose the tech stack you used for your capstone or portfolio project?",
      "If you rebuilt your most recent project today, what would you do differently?"
    ],
    closing: [
      "Why are you interested in this role specifically?",
      "Where do you want to be in your career three years from now?",
      "What questions do you have for me?"
    ]
  };

  function getCategories() {
    return Object.keys(QUESTIONS);
  }

  function getRandomQuestion(category) {
    const pool = QUESTIONS[category] || QUESTIONS.behavioral;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  global.ICQuestions = { QUESTIONS, getCategories, getRandomQuestion };
})(typeof window !== "undefined" ? window : globalThis);
