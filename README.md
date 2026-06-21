# LeetCode Local Judge & Java Playground

A complete, premium local coding platform and standalone Java Playground built with Node.js, Express, HTML, CSS, Vanilla JavaScript, and Monaco Editor. 

This platform compiles and executes Java code directly on your local machine using your system's installed JDK (`javac` and `java`).

---

## Folder Structure

```text
DSA_LOGIC_PROBLEMS/
|-- server.js             # Express backend judge and file API server
|-- index.html            # Main SPA dashboard interface
|-- app.js                # Frontend application and Monaco editor logic
|-- styles.css            # Premium dark/glassmorphic styling sheet
|-- README.md             # Project documentation (this file)
|-- progress.json         # Stores Solved/Attempted metrics
|
|-- problems/             # Database of coding problems
|   |-- SameTree/
|   |   |-- metadata.json # Problem configurations (returnType, methodName, etc.)
|   |   |-- template.java # Skeleton code loaded into the editor
|   |   |-- visible.txt   # Test cases run by the "Run" button
|   |   |-- hidden.txt    # Test cases run during submission
|   |   |-- notes.md      # Auto-saving markdown notes
|   |
|   |-- kthSmallest/
|   |-- maxIceCream/
|   |-- TimeAndWorkCycle/
|
|-- user_data/            # Contains current saved solutions for each problem
|   |-- SameTree.java
|   |-- maxIceCream.java
|
|-- submissions/          # Historical compilation copies organized by problem
|   |-- maxIceCream/
|       |-- 2026-06-22_10-15-00.java
|       |-- 2026-06-22_10-35-00.java
|
|-- workspace/            # Sandbox directory where temp compilation folders live
```

---

## Key Features

1. **Problems Mode**: Complete LeetCode-style problem practice, filtering by topic/difficulty, local progress statistics, and auto-saving solutions/notes.
2. **Playground Mode**: Write and execute *any* arbitrary Java program containing a `public static void main` method. No problems or templates required.
3. **Automatic Class Detection**: The backend auto-detects the Java class name defined inside the editor, creating the target source code files and matching test harness runners.
4. **Submissions Log**: Maintains timestamped versions of every successful or failed submission, allowing you to reload previous attempts at any time.
5. **Secure Local Sandboxing**: Runs files inside individual temporary sandbox sub-directories within `workspace/` and retains only the 10 most recent execution folders for debug analysis.
6. **Keybindings**:
   - `Ctrl + S`: Save code & test cases
   - `Ctrl + Enter`: Compile and Run visible test cases
   - `Ctrl + Shift + Enter`: Submit code (runs both visible & hidden test cases)

---

## Prerequisites & Installation

### 1. Local JDK Installation
You must have Java JDK installed on your machine and have both `java` and `javac` binaries registered in your system PATH environment variable.
Verify this in your shell:
```bash
java -version
javac -version
```

### 2. Startup Server
Run the local Node.js process:
```bash
npm install
node server.js
```

### 3. Open in Browser
Visit the following local address:
```text
http://localhost:3000
```
*Note: The platform status indicator at the top right will check and confirm if your Java compiler toolchain is correctly configured and healthy.*
