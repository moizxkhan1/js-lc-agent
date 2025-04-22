let totalTokens = 0;
let currentMode = "rag"; // default to rag mode

document.addEventListener("DOMContentLoaded", function () {
  const modeToggle = document.getElementById("mode-toggle");
  const modeLabel = document.getElementById("mode-label");

  modeToggle.checked = currentMode === "agent";
  modeLabel.textContent = currentMode === "agent" ? "Agent Mode" : "RAG Mode";

  modeToggle.addEventListener("change", function () {
    if (this.checked) {
      currentMode = "agent";
      modeLabel.textContent = "Agent Mode";
    } else {
      currentMode = "rag";
      modeLabel.textContent = "RAG Mode";
    }
    console.log("Mode switched to:", currentMode);
  });
});

async function askQuestion() {
  const questionInput = document.getElementById("question");
  const question = questionInput.value;
  if (!question) return;

  appendMessage("user", question);
  questionInput.value = "";

  try {
    showTypingIndicator();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        mode: currentMode,
      }),
    });

    const result = await response.json();
    removeTypingIndicator();

    if (!result.usage) {
      result.usage = {
        completion_tokens: Math.ceil(result.answer.length / 4),
        prompt_tokens: Math.ceil(question.length / 4),
        total_tokens: Math.ceil((result.answer.length + question.length) / 4),
      };
    }

    totalTokens += result.usage.total_tokens || 0;
    updateTokenUsage(result.usage);

    appendMessage("bot", result.answer, result.usage);

    if (result.webResults) {
      appendWebResults(result.webResults);
    } else {
      const searchResultsContainer = document.getElementById(
        "search-results-container"
      );
      searchResultsContainer.classList.add("hidden");
    }
  } catch (error) {
    removeTypingIndicator();
    appendMessage("bot", "Error: " + error.message);
  }
}

function appendMessage(type, text, usage = null) {
  const chat = document.getElementById("chat");
  const msgDiv = document.createElement("div");
  msgDiv.className = `flex ${
    type === "user" ? "justify-end" : "justify-start"
  } mb-4`;

  const contentDiv = document.createElement("div");
  contentDiv.className = `max-w-[70%] rounded-lg p-3 ${
    type === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"
  }`;

  contentDiv.textContent = text;

  if (usage) {
    const usageDiv = document.createElement("div");
    usageDiv.className = "text-xs mt-1 text-gray-500";
    usageDiv.textContent = `Tokens: ${usage.total_tokens || 0}`;
    contentDiv.appendChild(usageDiv);
  }

  msgDiv.appendChild(contentDiv);
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
}

function appendWebResults(results) {
  if (!results || results.length === 0) return;

  // Show the search results in the tools section
  const searchResultsContainer = document.getElementById(
    "search-results-container"
  );
  searchResultsContainer.classList.remove("hidden");

  const resultsDiv = document.getElementById("search-results");
  resultsDiv.innerHTML = "";

  const resultsList = document.createElement("ul");
  resultsList.className = "space-y-2";

  results.forEach((result, index) => {
    const listItem = document.createElement("li");
    listItem.className = "text-sm";

    const linkElement = document.createElement("a");
    linkElement.href = result.link;
    linkElement.target = "_blank";
    linkElement.className = "text-blue-500 hover:underline font-medium";
    linkElement.textContent = result.title;

    const snippetElement = document.createElement("p");
    snippetElement.className = "text-gray-600 text-xs mt-1";
    snippetElement.textContent = result.snippet;

    listItem.appendChild(linkElement);
    listItem.appendChild(snippetElement);
    resultsList.appendChild(listItem);
  });

  resultsDiv.appendChild(resultsList);
}

function showTypingIndicator() {
  const chat = document.getElementById("chat");
  const indicatorDiv = document.createElement("div");
  indicatorDiv.id = "typing-indicator";
  indicatorDiv.className = "flex justify-start mb-4";
  indicatorDiv.innerHTML = `
    <div class="bg-gray-200 rounded-lg p-3">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chat.appendChild(indicatorDiv);
  chat.scrollTop = chat.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) indicator.remove();
}

function updateTokenUsage(usage) {
  const tokenUsageDiv = document.getElementById("token-usage");
  tokenUsageDiv.innerHTML = `
    <div>Completion tokens: ${usage.completion_tokens || 0}</div>
    <div>Prompt tokens: ${usage.prompt_tokens || 0}</div>
    <div>Total tokens: ${usage.total_tokens || 0}</div>
    <div class="mt-1 font-semibold">Conversation total: ${totalTokens}</div>
  `;
}

function addGradeRow() {
  const gradesDiv = document.getElementById("grades");
  const newRow = document.createElement("div");
  newRow.className = "grade-entry flex space-x-2 items-center";
  newRow.innerHTML = `
    <input type="number" placeholder="Credits" class="credits p-2 border rounded w-1/3">
    <input type="number" placeholder="Grade Points" class="points p-2 border rounded w-1/3">
    <button class="remove-row p-1 text-red-500 hover:text-red-700">✕</button>
  `;

  const removeButton = newRow.querySelector(".remove-row");
  removeButton.addEventListener("click", () => {
    newRow.remove();
  });

  gradesDiv.appendChild(newRow);
}

async function calculateCGPA() {
  const gradeEntries = document.querySelectorAll(".grade-entry");
  const grades = Array.from(gradeEntries)
    .map((entry) => ({
      credits: parseFloat(entry.querySelector(".credits").value),
      points: parseFloat(entry.querySelector(".points").value),
    }))
    .filter((grade) => !isNaN(grade.credits) && !isNaN(grade.points));

  const response = await fetch("/api/cgpa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grades }),
  });

  const result = await response.json();
  document.getElementById("cgpa-result").textContent =
    `Your CGPA is: ${result.cgpa}`;
}

function updateTokenUsage(usage) {
  if (!usage) return;

  const tokenUsageDiv = document.getElementById("token-usage");
  tokenUsageDiv.innerHTML = `
    <div>Completion tokens: ${Math.round(usage.completion_tokens) || 0}</div>
    <div>Prompt tokens: ${Math.round(usage.prompt_tokens) || 0}</div>
    <div>Total tokens: ${Math.round(usage.total_tokens) || 0}</div>
    <div class="mt-1 font-semibold">Conversation total: ${Math.round(
      totalTokens
    )}</div>
  `;
}

document.getElementById("question").addEventListener("keypress", (e) => {
  if (e.key === "Enter") askQuestion();
});
