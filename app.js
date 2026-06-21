// Client application logic for LeetCode Local

let editor = null;
let currentMode = "problems"; // "problems" or "playground"
let currentProblemId = null;
let problemsData = [];
let topicsList = new Set();
let saveDebounceTimer = null;
let notesDebounceTimer = null;

// Initialize Monaco Editor and UI
document.addEventListener("DOMContentLoaded", () => {
  initMonaco();
  initResizing();
  checkJavaHealth();
  loadProblems();
  setupEventListeners();
  loadPlaygroundCode();
});

// 1. Monaco Editor Initialization
function initMonaco() {
  require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs" } });
  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("monacoEditorContainer"), {
      value: `// Loading template...`,
      language: "java",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "var(--font-mono)",
      tabSize: 4,
      insertSpaces: true,
      padding: { top: 12 },
    });

    // Auto-save on change
    editor.onDidChangeModelContent(() => {
      triggerAutoSave();
    });

    // Trigger initial load code if problems are loaded
    if (currentMode === "playground") {
      loadPlaygroundCode();
    } else if (currentProblemId) {
      loadProblemDetails(currentProblemId);
    }
  });
}

// 2. Resizable Columns
function initResizing() {
  const workspace = document.getElementById("workspaceContainer");
  const problemPanel = document.getElementById("problemPanel");
  const editorPanel = document.getElementById("editorPanel");
  const resultsPanel = document.getElementById("resultsPanel");
  const handleLeft = document.getElementById("handleLeft");
  const handleRight = document.getElementById("handleRight");

  let isResizingLeft = false;
  let isResizingRight = false;

  handleLeft.addEventListener("mousedown", (e) => {
    isResizingLeft = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    handleLeft.classList.add("resizing");
  });

  handleRight.addEventListener("mousedown", (e) => {
    isResizingRight = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    handleRight.classList.add("resizing");
  });

  document.addEventListener("mousemove", (e) => {
    const rect = workspace.getBoundingClientRect();
    if (isResizingLeft) {
      const leftWidth = ((e.clientX - rect.left) / rect.width) * 100;
      if (leftWidth > 15 && leftWidth < 55) {
        problemPanel.style.width = `${leftWidth}%`;
        const rightWidth = parseFloat(resultsPanel.style.width);
        editorPanel.style.width = `${100 - leftWidth - rightWidth}%`;
      }
    } else if (isResizingRight) {
      const rightWidth = ((rect.right - e.clientX) / rect.width) * 100;
      if (rightWidth > 15 && rightWidth < 55) {
        resultsPanel.style.width = `${rightWidth}%`;
        const leftWidth = parseFloat(problemPanel.style.width);
        editorPanel.style.width = `${100 - leftWidth - rightWidth}%`;
      }
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizingLeft || isResizingRight) {
      isResizingLeft = false;
      isResizingRight = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
      handleLeft.classList.remove("resizing");
      handleRight.classList.remove("resizing");
      if (editor) {
        editor.layout();
      }
    }
  });
}

// 3. Check Java installation status
async function checkJavaHealth() {
  const badge = document.getElementById("javaHealthBadge");
  const text = badge.querySelector(".health-text");

  try {
    const res = await fetch("/api/health");
    const status = await res.json();

    badge.className = "health-badge"; // clear checking class
    if (status.java && status.javac) {
      badge.classList.add("healthy");
      text.textContent = "JDK Compiler Healthy";
    } else {
      badge.classList.add("unhealthy");
      text.textContent = "JDK Missing / Config Error";
      alert("Warning: JDK (javac/java) is not detected in your PATH. Code compilation will fail.");
    }
  } catch (err) {
    badge.className = "health-badge unhealthy";
    text.textContent = "Server Offline";
  }
}

// 4. Fetch & Load Problems list
async function loadProblems() {
  try {
    const res = await fetch("/api/problems");
    problemsData = await res.json();

    // Populate filter lists
    topicsList.clear();
    problemsData.forEach((prob) => {
      if (prob.topic) topicsList.add(prob.topic);
    });
    populateFilterTopicOptions();

    // Render list
    renderProblemList();
    updateProgressStats();

    // Open first problem by default if exists
    if (problemsData.length > 0 && !currentProblemId) {
      currentProblemId = problemsData[0].id;
      if (currentMode === "problems") {
        loadProblemDetails(currentProblemId);
      }
    }
  } catch (err) {
    console.error("Error loading problems:", err);
  }
}

function populateFilterTopicOptions() {
  const filterTopic = document.getElementById("filterTopic");
  // Keep first "All" option
  filterTopic.innerHTML = '<option value="All">All Topics</option>';
  topicsList.forEach((topic) => {
    const opt = document.createElement("option");
    opt.value = topic;
    opt.textContent = topic;
    filterTopic.appendChild(opt);
  });
}

function updateProgressStats() {
  fetch("/api/progress")
    .then((res) => res.json())
    .then((stats) => {
      document.getElementById("solvedCount").textContent = stats.solved || 0;
      document.getElementById("attemptedCount").textContent = stats.attempted || 0;
      document.getElementById("pendingCount").textContent = stats.pending || 0;

      // Update status badges in drawer list
      const solvedList = stats.solvedList || [];
      const attemptedList = stats.attemptedList || [];

      document.querySelectorAll(".status-indicator-dot").forEach((dot) => {
        const probId = dot.dataset.probId;
        dot.className = "status-indicator-dot";
        dot.textContent = "";

        if (solvedList.includes(probId)) {
          dot.classList.add("solved");
          dot.textContent = "✓";
        } else if (attemptedList.includes(probId)) {
          dot.classList.add("attempted");
          dot.textContent = "•";
        }
      });
    });
}

// Render problems in sidebar drawer
function renderProblemList() {
  const listEl = document.getElementById("problemList");
  const searchQuery = document.getElementById("problemSearch").value.toLowerCase();
  const filterDiff = document.getElementById("filterDifficulty").value;
  const filterTop = document.getElementById("filterTopic").value;

  listEl.innerHTML = "";

  const filtered = problemsData.filter((prob) => {
    const matchesSearch =
      prob.title.toLowerCase().includes(searchQuery) ||
      prob.id.toLowerCase().includes(searchQuery) ||
      (prob.topic && prob.topic.toLowerCase().includes(searchQuery));
    const matchesDiff = filterDiff === "All" || prob.difficulty === filterDiff;
    const matchesTopic = filterTop === "All" || prob.topic === filterTop;

    return matchesSearch && matchesDiff && matchesTopic;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No problems match the filter</p>';
    return;
  }

  filtered.forEach((prob) => {
    const item = document.createElement("div");
    item.className = `problem-item ${prob.id === currentProblemId ? "active" : ""}`;
    item.dataset.id = prob.id;

    item.innerHTML = `
      <div class="problem-item-details">
        <span class="problem-item-title">${prob.title}</span>
        <div class="problem-item-meta">
          <span class="badge ${prob.difficulty.toLowerCase()}">${prob.difficulty}</span>
          <span class="badge topic">${prob.topic || "DSA"}</span>
        </div>
      </div>
      <div class="status-indicator-dot" data-prob-id="${prob.id}"></div>
    `;

    item.addEventListener("click", () => {
      currentProblemId = prob.id;
      document.querySelectorAll(".problem-item").forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      loadProblemDetails(prob.id);
      toggleDrawer(false);
    });

    listEl.appendChild(item);
  });
}

// 5. Load problem details (code, metadata, visible tests, notes)
async function loadProblemDetails(problemId) {
  if (!problemId) return;

  try {
    const res = await fetch(`/api/problems/${problemId}`);
    const details = await res.json();

    // Render description tab
    document.getElementById("problemTitle").textContent = details.metadata.title;
    const diffBadge = document.getElementById("problemDifficulty");
    diffBadge.textContent = details.metadata.difficulty;
    diffBadge.className = `badge ${details.metadata.difficulty.toLowerCase()}`;

    const topicBadge = document.getElementById("problemTopic");
    topicBadge.textContent = details.metadata.topic;

    document.getElementById("problemDescription").textContent = details.metadata.description;

    // Render examples
    const examplesContainer = document.getElementById("problemExamples");
    examplesContainer.innerHTML = "";
    if (details.metadata.examples && details.metadata.examples.length > 0) {
      details.metadata.examples.forEach((ex, idx) => {
        const card = document.createElement("div");
        card.className = "example-card";
        card.innerHTML = `<strong>Example ${idx + 1}:</strong><br><strong>Input:</strong> ${ex.input}<br><strong>Output:</strong> ${ex.output}`;
        examplesContainer.appendChild(card);
      });
    }

    // Render constraints
    const constraintsList = document.getElementById("problemConstraints");
    constraintsList.innerHTML = "";
    if (details.metadata.constraints) {
      details.metadata.constraints.forEach((cons) => {
        const li = document.createElement("li");
        li.textContent = cons;
        constraintsList.appendChild(li);
      });
    }

    // Load template/saved code into Editor
    if (editor) {
      editor.setValue(details.savedCode);
    }

    // Notes tab
    document.getElementById("notesEditor").value = details.notes;
    document.getElementById("notesStatus").textContent = "Saved";

    // Test cases tab
    document.getElementById("testCaseEditor").value = details.visibleTests;
    document.getElementById("testCaseStatus").textContent = "Test cases loaded";

    // Submissions tab
    loadSubmissionHistory(problemId);

    // Reset results outputs
    clearResultsConsole();
  } catch (err) {
    console.error("Error loading problem details:", err);
  }
}

// Fetch submissions
async function loadSubmissionHistory(problemId) {
  const container = document.getElementById("submissionHistoryList");
  container.innerHTML = '<p class="empty-state">Loading submissions...</p>';

  try {
    const res = await fetch(`/api/submissions/${problemId}`);
    const history = await res.json();

    if (history.length === 0) {
      container.innerHTML = '<p class="empty-state">No submissions yet.</p>';
      return;
    }

    container.innerHTML = "";
    history.forEach((sub) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <span class="history-timestamp">${sub.timestamp}</span>
        <span class="history-action">View Code</span>
      `;
      item.addEventListener("click", () => {
        loadSubmissionCode(problemId, sub.filename);
      });
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Error loading history.</p>';
  }
}

async function loadSubmissionCode(problemId, filename) {
  if (confirm("Do you want to load this submission into the editor? Your current code will be overwritten.")) {
    try {
      const res = await fetch(`/api/submissions/${problemId}/${filename}`);
      const data = await res.json();
      if (editor) {
        editor.setValue(data.code);
        alert("Submission code loaded successfully!");
      }
    } catch (e) {
      alert("Failed to load submission code.");
    }
  }
}

// 6. Playground Mode Loader
async function loadPlaygroundCode() {
  if (currentMode !== "playground") return;

  const titleEl = document.getElementById("problemTitle");
  titleEl.textContent = "Java Playground";
  document.getElementById("problemDifficulty").style.display = "none";
  document.getElementById("problemTopic").style.display = "none";
  document.getElementById("problemDescription").textContent =
    "Write any Java program with a main method and click Run to compile and execute it locally on your machine.";
  document.getElementById("problemExamples").innerHTML = "";
  document.getElementById("problemConstraints").innerHTML = "";

  // Set test cases editor empty/hidden
  document.getElementById("testCaseEditor").value = "";

  // Read saved playground file from server (we'll save playground to problems/Playground/Solution.java mock or a generic route)
  // Let's call /api/problems/_Playground details if we want, or store it in localStorage.
  // Storing locally in user_data/_Playground.java on server:
  try {
    const res = await fetch("/api/problems/_Playground");
    if (res.ok) {
      const data = await res.json();
      if (editor) editor.setValue(data.savedCode);
    } else {
      // Default playground template
      if (editor) {
        editor.setValue(`public class Playground {\n    public static void main(String[] args) {\n        System.out.println("Hello from local Java Playground!");\n        System.out.println("Local JDK tools check: Java sandbox execution completes in milliseconds.");\n    }\n}`);
      }
    }
  } catch (e) {
    // fallback
  }
}

// 7. Auto-save systems
function triggerAutoSave() {
  if (!editor) return;
  const btn = document.getElementById("saveCodeBtn");
  btn.textContent = "Saving...";
  
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveCurrentCode(true); // silent = true
  }, 1500);
}

async function saveCurrentCode(silent = false) {
  if (!editor) return;
  const code = editor.getValue();
  const visibleTests = document.getElementById("testCaseEditor").value;

  const btn = document.getElementById("saveCodeBtn");
  if (!silent) btn.textContent = "Saving...";

  if (currentMode === "playground") {
    // Save playground code to mock _Playground endpoint or just save locally
    try {
      await fetch("/api/problems/_Playground/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      btn.textContent = "Saved";
      setTimeout(() => (btn.textContent = "Save"), 1000);
    } catch (e) {
      btn.textContent = "Save Failed";
    }
    return;
  }

  if (!currentProblemId) return;

  try {
    const res = await fetch(`/api/problems/${currentProblemId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        visibleTests,
      }),
    });
    if (res.ok) {
      btn.textContent = "Saved";
      document.getElementById("testCaseStatus").textContent = "Test cases saved locally";
      setTimeout(() => (btn.textContent = "Save"), 1500);
      updateProgressStats();
    } else {
      btn.textContent = "Save Failed";
    }
  } catch (err) {
    btn.textContent = "Save Error";
  }
}

// 8. Compile and Run & Submit
async function runCode() {
  if (!editor) return;

  // switch to Run Result tab
  document.querySelector('.tab-btn[data-tab="outputTab"]').click();

  const statusEl = document.getElementById("execStatus");
  statusEl.textContent = "Running...";
  statusEl.className = "status-indicator running";
  document.getElementById("execRuntime").textContent = "0 ms";

  clearResultsConsole();

  const code = editor.getValue();
  const visibleTests = document.getElementById("testCaseEditor").value;

  try {
    const payload = {
      code,
      problemId: currentMode === "problems" ? currentProblemId : null,
      visibleTests: currentMode === "problems" ? visibleTests : null,
    };

    const startTime = Date.now();
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    const runtimeMs = data.runtimeMs || (Date.now() - startTime);

    displayRunResult(data, runtimeMs);
  } catch (err) {
    statusEl.textContent = "System Error";
    statusEl.className = "status-indicator failed";
    document.getElementById("errorMessage").textContent = err.message;
    document.getElementById("errorConsole").classList.remove("hidden");
  }
}

async function submitCode() {
  if (currentMode !== "problems" || !currentProblemId) {
    alert("Submit is only available in Practice Mode.");
    return;
  }

  // switch to Run Result tab
  document.querySelector('.tab-btn[data-tab="outputTab"]').click();

  const statusEl = document.getElementById("execStatus");
  statusEl.textContent = "Judging...";
  statusEl.className = "status-indicator running";
  document.getElementById("execRuntime").textContent = "0 ms";

  clearResultsConsole();

  const code = editor.getValue();

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemId: currentProblemId,
        code,
      }),
    });

    const data = await res.json();
    displaySubmitResult(data);
  } catch (err) {
    statusEl.textContent = "System Error";
    statusEl.className = "status-indicator failed";
    document.getElementById("errorMessage").textContent = err.message;
    document.getElementById("errorConsole").classList.remove("hidden");
  }
}

function clearResultsConsole() {
  document.getElementById("errorConsole").classList.add("hidden");
  document.getElementById("stdoutConsole").classList.add("hidden");
  document.getElementById("errorMessage").textContent = "";
  document.getElementById("stdoutMessage").textContent = "";
  document.getElementById("testCardsContainer").innerHTML = "";
}

function displayRunResult(data, runtimeMs) {
  const statusEl = document.getElementById("execStatus");
  document.getElementById("execRuntime").textContent = `${runtimeMs} ms`;

  // Handle compilation/runtime error
  if (data.stderr && (!data.tests || data.tests.length === 0)) {
    statusEl.textContent = "Error";
    statusEl.className = "status-indicator failed";
    document.getElementById("errorMessage").textContent = data.stderr;
    document.getElementById("errorConsole").classList.remove("hidden");
    return;
  }

  // Set status
  if (data.success) {
    statusEl.textContent = "Finished";
    statusEl.className = "status-indicator accepted";
  } else {
    statusEl.textContent = "Failed";
    statusEl.className = "status-indicator failed";
  }

  // Stdout
  if (data.stdout) {
    // Filter out case print statements to show raw stdout
    const filteredStdout = data.stdout
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("CASE|") && !line.startsWith("CASE_ERROR|"))
      .join("\n")
      .trim();

    if (filteredStdout) {
      document.getElementById("stdoutMessage").textContent = filteredStdout;
      document.getElementById("stdoutConsole").classList.remove("hidden");
    }
  }

  // Render test cases results
  const cardsContainer = document.getElementById("testCardsContainer");
  cardsContainer.innerHTML = "";

  if (data.tests && data.tests.length > 0) {
    data.tests.forEach((tc) => {
      const card = document.createElement("div");
      card.className = `test-card ${tc.passed ? "passed" : "failed"}`;
      card.innerHTML = `
        <div class="test-card-header">
          <span>Test Case #${tc.id + 1}</span>
          <span class="test-status-label">${tc.passed ? "Passed" : "Wrong Answer"}</span>
        </div>
        <div class="test-card-body">
          <div>Expected: <span>${tc.expected}</span></div>
          <div>Actual: <span>${tc.actual}</span></div>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  } else {
    cardsContainer.innerHTML = `<p class="empty-state">Code executed successfully with no test cases specified.</p>`;
  }
}

function displaySubmitResult(data) {
  const statusEl = document.getElementById("execStatus");
  statusEl.textContent = data.status;
  document.getElementById("execRuntime").textContent = `${data.runtimeMs} ms`;

  if (data.status === "Accepted") {
    statusEl.className = "status-indicator accepted";
  } else {
    statusEl.className = "status-indicator failed";
  }

  // Stdout and errors
  if (data.stderr) {
    document.getElementById("errorMessage").textContent = data.stderr;
    document.getElementById("errorConsole").classList.remove("hidden");
  }

  // Render cards
  const cardsContainer = document.getElementById("testCardsContainer");
  cardsContainer.innerHTML = "";

  if (data.tests && data.tests.length > 0) {
    data.tests.forEach((tc) => {
      const card = document.createElement("div");
      card.className = `test-card ${tc.passed ? "passed" : "failed"}`;
      card.innerHTML = `
        <div class="test-card-header">
          <span>Test Case #${tc.id + 1}</span>
          <span class="test-status-label">${tc.passed ? "Passed" : "Failed"}</span>
        </div>
        <div class="test-card-body">
          <div>Expected: <span>${tc.expected}</span></div>
          <div>Actual: <span>${tc.actual}</span></div>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  // Update solved status counts and submissions list
  updateProgressStats();
  if (currentProblemId) {
    loadSubmissionHistory(currentProblemId);
  }
}

// 9. Event Listeners Setup
function setupEventListeners() {
  // Drawer Toggle
  document.getElementById("toggleDrawerBtn").addEventListener("click", () => toggleDrawer(true));
  document.getElementById("closeDrawerBtn").addEventListener("click", () => toggleDrawer(false));
  document.querySelector(".drawer-overlay").addEventListener("click", () => toggleDrawer(false));

  // Search and filters
  document.getElementById("problemSearch").addEventListener("input", renderProblemList);
  document.getElementById("filterDifficulty").addEventListener("change", renderProblemList);
  document.getElementById("filterTopic").addEventListener("change", renderProblemList);

  // Tab systems
  document.querySelectorAll(".tabs-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      if (e.target.classList.contains("tab-btn")) {
        const tabPaneId = e.target.dataset.tab;
        const panel = e.target.closest(".panel");

        // Deactivate active tabs inside this panel
        panel.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
        panel.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));

        // Activate selected tab
        e.target.classList.add("active");
        panel.querySelector(`#${tabPaneId}`).classList.add("active");
      }
    });
  });

  // Notes Auto-save
  document.getElementById("notesEditor").addEventListener("input", () => {
    const status = document.getElementById("notesStatus");
    status.textContent = "Saving...";

    clearTimeout(notesDebounceTimer);
    notesDebounceTimer = setTimeout(() => {
      saveNotes();
    }, 1500);
  });

  // Reset button
  document.getElementById("resetCodeBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to reset the editor to the problem template?")) {
      if (currentMode === "playground") {
        loadPlaygroundCode();
      } else {
        fetch(`/api/problems/${currentProblemId}`)
          .then((res) => res.json())
          .then((details) => {
            if (editor) editor.setValue(details.template);
          });
      }
    }
  });

  // Save button
  document.getElementById("saveCodeBtn").addEventListener("click", () => saveCurrentCode(false));

  // Run and Submit buttons
  document.getElementById("runCodeBtn").addEventListener("click", runCode);
  document.getElementById("submitCodeBtn").addEventListener("click", submitCode);

  // Mode toggles (Problems vs Playground)
  document.getElementById("modeProblemsBtn").addEventListener("click", () => switchMode("problems"));
  document.getElementById("modePlaygroundBtn").addEventListener("click", () => switchMode("playground"));

  // Create Problem Modal
  const modal = document.getElementById("createProblemModal");
  document.getElementById("createProblemBtn").addEventListener("click", () => {
    modal.classList.add("open");
  });
  document.getElementById("closeModalBtn").addEventListener("click", () => {
    modal.classList.remove("open");
  });
  document.getElementById("cancelCreateBtn").addEventListener("click", () => {
    modal.classList.remove("open");
  });

  // Create Problem Form submission
  document.getElementById("createProblemForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const argTypesStr = document.getElementById("newArgTypes").value;
    const argumentTypes = argTypesStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const payload = {
      id: document.getElementById("newId").value.trim(),
      title: document.getElementById("newTitle").value.trim(),
      difficulty: document.getElementById("newDifficulty").value,
      topic: document.getElementById("newTopic").value.trim(),
      methodName: document.getElementById("newMethodName").value.trim(),
      returnType: document.getElementById("newReturnType").value.trim(),
      argumentTypes,
      description: document.getElementById("newDescription").value.trim(),
      constraints: document.getElementById("newConstraints").value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0),
      templateCode: document.getElementById("newTemplateCode").value,
      visibleTests: document.getElementById("newVisibleTests").value,
      hiddenTests: document.getElementById("newHiddenTests").value,
    };

    try {
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert("Problem created successfully!");
        modal.classList.remove("open");
        document.getElementById("createProblemForm").reset();
        loadProblems(); // refresh lists
      } else {
        const data = await res.json();
        alert(`Error creating problem: ${data.error}`);
      }
    } catch (err) {
      alert(`Network error creating problem: ${err.message}`);
    }
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    // Ctrl + S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveCurrentCode(false);
    }
    // Ctrl + Enter: Run
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runCode();
    }
    // Ctrl + Shift + Enter: Submit
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitCode();
    }
  });
}

function toggleDrawer(open) {
  const drawer = document.getElementById("problemsDrawer");
  if (open) {
    drawer.classList.add("open");
    updateProgressStats();
  } else {
    drawer.classList.remove("open");
  }
}

async function saveNotes() {
  if (currentMode === "playground" || !currentProblemId) return;
  const notes = document.getElementById("notesEditor").value;

  try {
    const res = await fetch(`/api/problems/${currentProblemId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });

    if (res.ok) {
      document.getElementById("notesStatus").textContent = "All notes saved";
    } else {
      document.getElementById("notesStatus").textContent = "Save failed";
    }
  } catch (err) {
    document.getElementById("notesStatus").textContent = "Save failed";
  }
}

// 10. Switch application mode (Problems vs Playground)
function switchMode(mode) {
  if (currentMode === mode) return;

  currentMode = mode;
  document.getElementById("modeProblemsBtn").classList.toggle("active", mode === "problems");
  document.getElementById("modePlaygroundBtn").classList.toggle("active", mode === "playground");

  const body = document.body;
  if (mode === "playground") {
    body.classList.add("playground-mode");
    loadPlaygroundCode();
  } else {
    body.classList.remove("playground-mode");
    document.getElementById("problemDifficulty").style.display = "inline-block";
    document.getElementById("problemTopic").style.display = "inline-block";
    loadProblemDetails(currentProblemId);
  }

  if (editor) {
    editor.layout();
  }
}
