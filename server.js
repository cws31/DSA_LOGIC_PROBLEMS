const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PROBLEMS_DIR = path.join(__dirname, "problems");
const USER_DATA_DIR = path.join(__dirname, "user_data");
const SUBMISSIONS_DIR = path.join(__dirname, "submissions");
const WORKSPACE_DIR = path.join(__dirname, "workspace");
const PROGRESS_FILE = path.join(__dirname, "progress.json");

// Ensure directories exist
[PROBLEMS_DIR, USER_DATA_DIR, SUBMISSIONS_DIR, WORKSPACE_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper: check progress.json
function getProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch (e) {
      // fallback
    }
  }
  return { solved: 0, attempted: 0, pending: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf8");
}

// Helper: clean old workspaces (keep latest 10)
function cleanOldWorkspaces() {
  try {
    const files = fs.readdirSync(WORKSPACE_DIR);
    const runs = files
      .filter((f) => f.startsWith("run_"))
      .map((f) => {
        const fullPath = path.join(WORKSPACE_DIR, f);
        return { name: f, path: fullPath, stat: fs.statSync(fullPath) };
      })
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs); // oldest first

    while (runs.length > 10) {
      const oldest = runs.shift();
      fs.rmSync(oldest.path, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Error cleaning workspaces:", err);
  }
}

// Helper: format arguments for Java Main template
function formatJavaArg(valStr, type) {
  valStr = valStr.trim();
  if (type === "int[]") {
    const inner = valStr.replace(/^\[|\]$/g, "").trim();
    return `new int[]{${inner}}`;
  }
  if (type === "double[]") {
    const inner = valStr.replace(/^\[|\]$/g, "").trim();
    return `new double[]{${inner}}`;
  }
  if (type === "String[]") {
    const inner = valStr.replace(/^\[|\]$/g, "").trim();
    if (!inner) return `new String[]{}`;
    const elements = inner
      .split(",")
      .map((s) => {
        s = s.trim();
        if (s.startsWith('"') && s.endsWith('"')) return s;
        return `"${s}"`;
      })
      .join(", ");
    return `new String[]{${elements}}`;
  }
  if (type === "Integer[]") {
    const inner = valStr.replace(/^\[|\]$/g, "").trim();
    return `new Integer[]{${inner}}`;
  }
  if (type === "TreeNode") {
    const inner = valStr.replace(/^\[|\]$/g, "").trim();
    return `build(new Integer[]{${inner}})`;
  }
  if (type === "String") {
    if (valStr.startsWith('"') && valStr.endsWith('"')) return valStr;
    return `"${valStr}"`;
  }
  return valStr; // raw representation for primitive int, double, boolean
}

// Helper: format return checks
function formatJavaActual(returnType, expression) {
  if (returnType.endsWith("[]")) {
    return `java.util.Arrays.toString(${expression})`;
  }
  return `${expression}`;
}

// Helper: build Main.java runner source
function generateMainJava(metadata, className, testCases) {
  const { methodName, returnType, argumentTypes } = metadata;
  const needsTreeNode = argumentTypes.includes("TreeNode") || returnType === "TreeNode";

  let javaCode = `import java.util.*;\n\n`;

  if (needsTreeNode) {
    javaCode += `class TreeNode {\n`;
    javaCode += `    int val;\n`;
    javaCode += `    TreeNode left;\n`;
    javaCode += `    TreeNode right;\n`;
    javaCode += `    TreeNode(int val) { this.val = val; }\n`;
    javaCode += `}\n\n`;
  }

  javaCode += `public class Main {\n`;

  if (needsTreeNode) {
    javaCode += `    static TreeNode build(Integer[] values) {\n`;
    javaCode += `        if (values == null || values.length == 0 || values[0] == null) return null;\n`;
    javaCode += `        TreeNode[] nodes = new TreeNode[values.length];\n`;
    javaCode += `        for (int i = 0; i < values.length; i++) {\n`;
    javaCode += `            if (values[i] != null) nodes[i] = new TreeNode(values[i]);\n`;
    javaCode += `        }\n`;
    javaCode += `        for (int i = 0; i < values.length; i++) {\n`;
    javaCode += `            if (nodes[i] == null) continue;\n`;
    javaCode += `            int left = 2 * i + 1;\n`;
    javaCode += `            int right = 2 * i + 2;\n`;
    javaCode += `            if (left < values.length) nodes[i].left = nodes[left];\n`;
    javaCode += `            if (right < values.length) nodes[i].right = nodes[right];\n`;
    javaCode += `        }\n`;
    javaCode += `        return nodes[0];\n`;
    javaCode += `    }\n\n`;
  }

  javaCode += `    public static void main(String[] args) {\n`;
  javaCode += `        ${className} sol = new ${className}();\n`;
  javaCode += `        try {\n`;

  testCases.forEach((tc, index) => {
    if (!tc.trim() || tc.trim().startsWith("#")) return;
    const parts = tc.split("|").map((p) => p.trim());
    const expected = parts[argumentTypes.length] || "";
    const argsList = [];
    for (let i = 0; i < argumentTypes.length; i++) {
      argsList.push(formatJavaArg(parts[i] || "", argumentTypes[i]));
    }

    const callExpression = `sol.${methodName}(${argsList.join(", ")})`;
    const actualExpr = formatJavaActual(returnType, callExpression);

    javaCode += `            {\n`;
    javaCode += `                System.out.println("CASE|${index}|EXPECTED|${expected.replace(/"/g, '\\"')}|ACTUAL|" + ${actualExpr});\n`;
    javaCode += `            }\n`;
  });

  javaCode += `        } catch (Exception e) {\n`;
  javaCode += `            System.out.println("CASE_ERROR|" + e.getMessage());\n`;
  javaCode += `            e.printStackTrace();\n`;
  javaCode += `        }\n`;
  javaCode += `    }\n`;
  javaCode += `}\n`;

  return javaCode;
}

// 1. Health API
app.get("/api/health", (req, res) => {
  execFile("java", ["-version"], (javaErr) => {
    execFile("javac", ["-version"], (javacErr) => {
      res.json({
        java: !javaErr,
        javac: !javacErr,
      });
    });
  });
});

// 2. GET /api/problems
app.get("/api/problems", (req, res) => {
  try {
    const folders = fs.readdirSync(PROBLEMS_DIR);
    const problems = [];
    folders.forEach((folder) => {
      const metaPath = path.join(PROBLEMS_DIR, folder, "metadata.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          problems.push(meta);
        } catch (e) {
          // invalid json
        }
      }
    });

    // Update progress numbers based on dashboard requirements
    const progress = getProgress();
    // Re-verify the counts
    const solvedCount = progress.solvedList ? progress.solvedList.length : 0;
    const attemptedList = progress.attemptedList || [];
    const pendingCount = Math.max(0, problems.length - solvedCount);

    saveProgress({
      solved: solvedCount,
      attempted: attemptedList.length,
      pending: pendingCount,
      solvedList: progress.solvedList || [],
      attemptedList: attemptedList,
    });

    res.json(problems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /api/problems/:id
app.get("/api/problems/:id", (req, res) => {
  const problemId = req.params.id;
  const problemDir = path.join(PROBLEMS_DIR, problemId);

  if (!fs.existsSync(problemDir)) {
    return res.status(404).json({ error: "Problem not found" });
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(problemDir, "metadata.json"), "utf8"));
    const template = fs.readFileSync(path.join(problemDir, "template.java"), "utf8");

    // Load saved user code if exists, otherwise template
    const userCodePath = path.join(USER_DATA_DIR, `${problemId}.java`);
    const savedCode = fs.existsSync(userCodePath) ? fs.readFileSync(userCodePath, "utf8") : template;

    // Load notes if exists
    const notesPath = path.join(problemDir, "notes.md");
    const notes = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, "utf8") : "";

    // Load visible tests
    const visibleTests = fs.readFileSync(path.join(problemDir, "visible.txt"), "utf8");

    res.json({
      metadata,
      template,
      savedCode,
      notes,
      visibleTests,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/problems
app.post("/api/problems", (req, res) => {
  const {
    id,
    title,
    difficulty,
    topic,
    methodName,
    returnType,
    argumentTypes,
    description,
    constraints,
    examples,
    visibleTests,
    hiddenTests,
    templateCode,
  } = req.body;

  if (!id || !title) {
    return res.status(400).json({ error: "Missing required fields id/title" });
  }

  const problemDir = path.join(PROBLEMS_DIR, id);
  if (fs.existsSync(problemDir)) {
    return res.status(400).json({ error: "Problem with this ID already exists" });
  }

  try {
    fs.mkdirSync(problemDir, { recursive: true });

    // Format metadata
    const metadata = {
      id,
      title,
      difficulty,
      topic,
      methodName,
      returnType,
      argumentTypes: argumentTypes || [],
      description,
      constraints: Array.isArray(constraints) ? constraints : [constraints],
      examples: examples || [],
    };

    fs.writeFileSync(path.join(problemDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
    fs.writeFileSync(path.join(problemDir, "template.java"), templateCode || "", "utf8");
    fs.writeFileSync(path.join(problemDir, "visible.txt"), visibleTests || "", "utf8");
    fs.writeFileSync(path.join(problemDir, "hidden.txt"), hiddenTests || "", "utf8");
    fs.writeFileSync(
      path.join(problemDir, "notes.md"),
      `# Notes for ${title}\n\n- Write solution notes here.`,
      "utf8"
    );

    res.json({ success: true, message: "Problem created successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. POST /api/problems/:id/save
app.post("/api/problems/:id/save", (req, res) => {
  const problemId = req.params.id;
  const { code, notes, visibleTests } = req.body;
  const problemDir = path.join(PROBLEMS_DIR, problemId);

  if (!fs.existsSync(problemDir)) {
    return res.status(404).json({ error: "Problem not found" });
  }

  try {
    if (code !== undefined) {
      fs.writeFileSync(path.join(USER_DATA_DIR, `${problemId}.java`), code, "utf8");
    }
    if (notes !== undefined) {
      fs.writeFileSync(path.join(problemDir, "notes.md"), notes, "utf8");
    }
    if (visibleTests !== undefined) {
      fs.writeFileSync(path.join(problemDir, "visible.txt"), visibleTests, "utf8");
    }

    // Update attempted progress
    const progress = getProgress();
    if (!progress.attemptedList) progress.attemptedList = [];
    if (!progress.attemptedList.includes(problemId)) {
      progress.attemptedList.push(problemId);
      progress.attempted = progress.attemptedList.length;
      saveProgress(progress);
    }

    res.json({ success: true, message: "Problem saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/problems/_Playground (retrieve playground code)
app.get("/api/problems/_Playground", (req, res) => {
  const codePath = path.join(USER_DATA_DIR, `Playground.java`);
  if (fs.existsSync(codePath)) {
    res.json({ savedCode: fs.readFileSync(codePath, "utf8") });
  } else {
    res.status(404).json({ error: "No saved code" });
  }
});

// POST /api/problems/_Playground/save (save playground code)
app.post("/api/problems/_Playground/save", (req, res) => {
  const { code } = req.body;
  const codePath = path.join(USER_DATA_DIR, `Playground.java`);
  try {
    fs.writeFileSync(codePath, code, "utf8");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. GET /api/progress
app.get("/api/progress", (req, res) => {
  res.json(getProgress());
});

// 7. GET /api/submissions/:problemId (view submission history)
app.get("/api/submissions/:problemId", (req, res) => {
  const problemId = req.params.problemId;
  const subDir = path.join(SUBMISSIONS_DIR, problemId);
  if (!fs.existsSync(subDir)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(subDir)
      .filter((f) => f.endsWith(".java"))
      .sort()
      .reverse(); // Newest first

    res.json(files.map((file) => ({
      filename: file,
      timestamp: file.replace(".java", "").replace("_", " "),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/:problemId/:filename (retrieve specific submission)
app.get("/api/submissions/:problemId/:filename", (req, res) => {
  const { problemId, filename } = req.params;
  const filePath = path.join(SUBMISSIONS_DIR, problemId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Submission not found" });
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ code: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Core sandbox runner compiler/executor logic
async function executeJavaSandbox(code, problemId, testCasesContent) {
  // 1. Detect Class name
  let className = "Solution";
  const classMatch = code.match(/(?:public\s+)?class\s+(\w+)/);
  if (classMatch) {
    className = classMatch[1];
  }

  // 2. Create Run folder
  const runId = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const runDir = path.join(WORKSPACE_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const classJavaPath = path.join(runDir, `${className}.java`);
  const mainJavaPath = path.join(runDir, "Main.java");

  // Write Solution Class
  fs.writeFileSync(classJavaPath, code, "utf8");

  const hasMain = code.includes("public static void main");
  let usesHarness = false;

  if (hasMain) {
    // Run directly
  } else {
    if (!problemId) {
      fs.rmSync(runDir, { recursive: true, force: true });
      return {
        success: false,
        stdout: "",
        stderr: "No main method found in Playground Mode. Please write a main method to execute arbitrary Java programs.",
        runtimeMs: 0,
      };
    }
    // Problems Mode - Generate Main.java
    const metaPath = path.join(PROBLEMS_DIR, problemId, "metadata.json");
    if (!fs.existsSync(metaPath)) {
      fs.rmSync(runDir, { recursive: true, force: true });
      return {
        success: false,
        stdout: "",
        stderr: `Metadata file not found for problem ${problemId}`,
        runtimeMs: 0,
      };
    }

    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const testCases = testCasesContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    const mainSource = generateMainJava(metadata, className, testCases);
    fs.writeFileSync(mainJavaPath, mainSource, "utf8");
    usesHarness = true;
  }

  // 3. Compile
  const compilePromise = new Promise((resolve) => {
    const filesToCompile = usesHarness ? ["Main.java", `${className}.java`] : [`${className}.java`];
    execFile("javac", ["-cp", ".", ...filesToCompile], { cwd: runDir, timeout: 5000 }, (err, stdout, stderr) => {
      resolve({ code: err ? 1 : 0, stdout, stderr });
    });
  });

  const compileResult = await compilePromise;
  if (compileResult.code !== 0) {
    // Compilation failed
    // Clean up but keep latest 10 runs
    cleanOldWorkspaces();
    return {
      success: false,
      stdout: compileResult.stdout,
      stderr: compileResult.stderr || "Compilation failed.",
      runtimeMs: 0,
      isCompileError: true,
    };
  }

  // 4. Execute
  const executionTarget = usesHarness ? "Main" : className;
  const startTime = process.hrtime();

  const executePromise = new Promise((resolve) => {
    execFile("java", ["-cp", ".", executionTarget], { cwd: runDir, timeout: 5000 }, (err, stdout, stderr) => {
      const diff = process.hrtime(startTime);
      const runtimeMs = Math.round(diff[0] * 1000 + diff[1] / 1000000);
      resolve({
        code: err ? (err.killed ? 124 : 1) : 0,
        stdout,
        stderr,
        runtimeMs,
        killed: err ? err.killed : false,
      });
    });
  });

  const execResult = await executePromise;

  // Clean workspaces count
  cleanOldWorkspaces();

  if (execResult.killed) {
    return {
      success: false,
      stdout: execResult.stdout,
      stderr: execResult.stderr || "Execution timed out (Limit 5 seconds).",
      runtimeMs: execResult.runtimeMs,
      isTimeout: true,
    };
  }

  return {
    success: execResult.code === 0,
    stdout: execResult.stdout,
    stderr: execResult.stderr,
    runtimeMs: execResult.runtimeMs,
    usesHarness,
  };
}

// helper: parse harness print lines to determine passed/failed test cases
function parseTestResults(stdout) {
  const lines = stdout.split(/\r?\n/);
  const results = [];
  let passedCount = 0;

  lines.forEach((line) => {
    if (line.startsWith("CASE|")) {
      const parts = line.split("|");
      const id = parseInt(parts[1], 10);
      const expected = parts[3];
      const actual = parts[5];

      // Compare actual vs expected
      let passed = false;
      const actVal = actual.trim();
      const expVal = expected.trim();

      if (!isNaN(actVal) && !isNaN(expVal) && actVal.includes(".") && expVal.includes(".")) {
        passed = Math.abs(parseFloat(actVal) - parseFloat(expVal)) < 0.0001;
      } else {
        passed = actVal.toLowerCase() === expVal.toLowerCase();
      }

      if (passed) passedCount++;

      results.push({
        id,
        expected,
        actual,
        passed,
      });
    }
  });

  return { results, passedCount };
}

// 8. POST /api/run
app.post("/api/run", async (req, res) => {
  const { problemId, code, visibleTests } = req.body;

  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  try {
    let testCasesContent = visibleTests;
    if (problemId && !testCasesContent) {
      const testPath = path.join(PROBLEMS_DIR, problemId, "visible.txt");
      if (fs.existsSync(testPath)) {
        testCasesContent = fs.readFileSync(testPath, "utf8");
      }
    }

    const execResult = await executeJavaSandbox(code, problemId, testCasesContent || "");

    if (execResult.isCompileError || execResult.isTimeout) {
      return res.json({
        success: false,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        runtimeMs: execResult.runtimeMs,
        tests: [],
      });
    }

    // If it was problem runner mode, extract the test details
    let tests = [];
    if (execResult.usesHarness) {
      const { results } = parseTestResults(execResult.stdout);
      tests = results;
    }

    res.json({
      success: execResult.success,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      runtimeMs: execResult.runtimeMs,
      tests,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. POST /api/submit
app.post("/api/submit", async (req, res) => {
  const { problemId, code } = req.body;

  if (!problemId || !code) {
    return res.status(400).json({ error: "Missing required fields problemId/code" });
  }

  const problemDir = path.join(PROBLEMS_DIR, problemId);
  if (!fs.existsSync(problemDir)) {
    return res.status(404).json({ error: "Problem directory not found" });
  }

  try {
    // 1. Read visible tests & hidden tests
    const visibleTests = fs.readFileSync(path.join(problemDir, "visible.txt"), "utf8");
    const hiddenTests = fs.readFileSync(path.join(problemDir, "hidden.txt"), "utf8");

    // Merge both
    const allTests = `${visibleTests}\n${hiddenTests}`;
    const testCasesList = allTests
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    // 2. Execute
    const execResult = await executeJavaSandbox(code, problemId, allTests);

    if (execResult.isCompileError) {
      return res.json({
        status: "Compile Error",
        passed: 0,
        total: testCasesList.length,
        runtimeMs: 0,
        stderr: execResult.stderr,
      });
    }

    if (execResult.isTimeout) {
      return res.json({
        status: "Time Limit Exceeded",
        passed: 0,
        total: testCasesList.length,
        runtimeMs: execResult.runtimeMs,
        stderr: execResult.stderr,
      });
    }

    if (!execResult.success && !execResult.usesHarness) {
      return res.json({
        status: "Runtime Error",
        passed: 0,
        total: testCasesList.length,
        runtimeMs: execResult.runtimeMs,
        stderr: execResult.stderr,
      });
    }

    // 3. Parse test outputs
    const { results, passedCount } = parseTestResults(execResult.stdout);
    const total = testCasesList.length;
    const isAccepted = passedCount === total;
    const status = isAccepted ? "Accepted" : "Wrong Answer";

    // 4. Update progress
    const progress = getProgress();
    if (!progress.solvedList) progress.solvedList = [];
    if (!progress.attemptedList) progress.attemptedList = [];

    if (!progress.attemptedList.includes(problemId)) {
      progress.attemptedList.push(problemId);
    }

    if (isAccepted && !progress.solvedList.includes(problemId)) {
      progress.solvedList.push(problemId);
    }

    progress.solved = progress.solvedList.length;
    progress.attempted = progress.attemptedList.length;
    progress.pending = Math.max(0, fs.readdirSync(PROBLEMS_DIR).length - progress.solved);

    saveProgress(progress);

    // 5. Store code in submissions folder
    const problemSubDir = path.join(SUBMISSIONS_DIR, problemId);
    if (!fs.existsSync(problemSubDir)) {
      fs.mkdirSync(problemSubDir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/T/, "_")
      .replace(/\..+/, "")
      .replace(/:/g, "-"); // Windows friendly file names
    fs.writeFileSync(path.join(problemSubDir, `${timestamp}.java`), code, "utf8");

    res.json({
      status,
      passed: passedCount,
      total,
      runtimeMs: execResult.runtimeMs,
      tests: results,
      stderr: execResult.stderr,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LeetCode Local platform running at http://localhost:${PORT}`);
});
