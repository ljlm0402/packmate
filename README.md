<h1 align="center">
  <br>
  <img src="https://github.com/ljlm0402/packmate/raw/images/logo.png" alt="Project Logo" width="600" />
  <br>
  <br>
  PackMate
  <br>
</h1>

<h4 align="center">🤖 Your smart and friendly CLI assistant for dependency updates, security scanning, advanced analysis, and team collaboration</h4>

<p align ="center">
    <a href="https://nodei.co/npm/packmate" target="_blank">
    <img src="https://nodei.co/npm/packmate.png" alt="npm Info" />
</a>

</p>

<p align="center">
    <a href="http://npm.im/packmate" target="_blank">
      <img src="https://img.shields.io/npm/v/packmate.svg" alt="npm Version" />
    </a>
    <a href="http://npm.im/packmate" target="_blank">
      <img src="https://img.shields.io/github/v/release/ljlm0402/packmate" alt="npm Release Version" />
    </a>
    <a href="http://npm.im/packmate" target="_blank">
      <img src="https://img.shields.io/npm/dm/packmate.svg" alt="npm Downloads" />
    </a>
    <a href="http://npm.im/packmate" target="_blank">
      <img src="https://img.shields.io/npm/l/packmate.svg" alt="npm Package License" />
    </a>
</p>

<p align="center">
  <a href="https://github.com/ljlm0402/packmate/stargazers" target="_blank">
    <img src="https://img.shields.io/github/stars/ljlm0402/packmate" alt="github Stars" />
  </a>
  <a href="https://github.com/ljlm0402/packmate/network/members" target="_blank">
    <img src="https://img.shields.io/github/forks/ljlm0402/packmate" alt="github Forks" />
  </a>
  <a href="https://github.com/ljlm0402/packmate/stargazers" target="_blank">
    <img src="https://img.shields.io/github/contributors/ljlm0402/packmate" alt="github Contributors" />
  </a>
  <a href="https://github.com/ljlm0402/packmate/issues" target="_blank">
    <img src="https://img.shields.io/github/issues/ljlm0402/packmate" alt="github Issues" />
  </a>
</p>

<p align="center">
  <strong>· English <a href="./README.ko.md">· Korean</a></strong>
</p>

---

Packmate is a modern CLI tool for managing, updating, and cleaning up your Node.js project dependencies.

It supports **npm**, **pnpm**, and **yarn**. With an intuitive interactive UI and powerful performance optimizations, Packmate helps you keep your project healthy and up-to-date—faster and safer than ever.

## 🤖 Why Packmate?

- **⚡ Performance**: 6x faster with 3-level caching system (memory + disk + network)
- **🎯 Accuracy**: 90%+ unused package detection with dev tool intelligence
- **🛡️ Safety**: Smart fallback for package managers, unused packages excluded from updates
- **🎨 Clarity**: Grouped UI sessions (Patch/Minor/Major) with color-coded updates
- **🔧 Flexibility**: Full configuration support via `packmate.config.json`
- **🌍 Modern**: Clean, professional English interface with intuitive workflows

## 🚀 Features

### Performance & Optimization
- **3-Level Caching System**: Memory → Disk (1hr TTL) → Network
  - First run: Standard speed
  - Second run: **6x faster** with cached registry data
- **Worker Pool Processing**: Multi-core CPU utilization for file scanning (**2-4x faster**)
- **Compressed Caching**: Brotli compression achieving **90% storage reduction**
- **Predictive Caching**: AI-powered package prediction and pre-loading
- **Adaptive Concurrency**: Dynamic request throttling based on CPU cores (8-16 concurrent)

### Advanced Security & Analysis (NEW in v2.2.0)
- **Multi-Source Security Scanning**:
  - **npm audit**: Official npm security advisories
  - **OSV Database**: Google's Open Source Vulnerabilities database
  - **GitHub Advisory**: GitHub's security advisory database
- **Advanced TypeScript Analysis**:
  - Decorator pattern detection (`@Component`, `@Injectable`, etc.)
  - Generic type usage analysis
  - Complex import pattern recognition
  - AST-based code structure analysis
- **Configuration File Analysis**:
  - Webpack, Vite, Rollup configuration parsing
  - Babel, TypeScript, Jest config dependencies
  - Dynamic import and code-splitting detection

### Team Collaboration & Policy Management (NEW in v2.2.0)
- **Team Configuration Management**:
  - Centralized team policies and rules
  - Git hooks integration (pre-commit, pre-push, commit-msg)
  - Team synchronization with conflict detection
- **Policy Validation Engine**:
  - License compliance checking
  - Dependency version control policies
  - Security vulnerability thresholds
  - Performance and bundle size limits
- **Preset Templates**:
  - **Strict**: Maximum security (Financial/Healthcare)
  - **Moderate**: Balanced development velocity
  - **Open Source**: Community development optimized
  - **Startup**: Fast development with safety nets
  - **Loose**: Minimal restrictions for prototyping

### Smart Detection
- **Enhanced Unused Detection** (90%+ accuracy):
  - Dynamic import detection: `import('module')`
  - Conditional require detection: `try-catch`, `if` blocks
  - DevDependencies intelligence: Recognizes build tools, linters, type definitions
  - Cross-validation: precinct + depcheck for high confidence
- **Update Detection**:
  - Grouped by Patch/Minor/Major with color coding
  - Unused packages automatically excluded from update suggestions
  - Semver-aware version comparison
- **Installation Detection**: Finds declared but not installed packages

### UI/UX Excellence
- **Grouped UI Sessions**:
  - 🔹 **Patch Updates** (Green): Bug fixes, safe to update
  - 🔸 **Minor Updates** (Yellow): New features, backward compatible
  - 🔶 **Major Updates** (Red): Breaking changes, requires review
  - 🗑️ **Unused Packages**: High/Medium confidence levels
  - 📥 **Not Installed**: Missing declared dependencies
  - ✅ **Up-to-date**: Informational list (non-selectable)
- **Safety Features**:
  - Confirmation prompt for major updates
  - Breaking change warnings
  - Clear action summaries
- **Visual Enhancements**:
  - Color-coded version changes
  - Progress bars for long operations
  - Fixed console box alignment

### Configuration & Flexibility
- **Smart Package Manager Detection**:
  - Auto-detects from lock files (pnpm-lock.yaml, yarn.lock, package-lock.json)
  - Verifies installation status
  - Auto-fallback to available manager with helpful tips
- **Configurable Options**:
  - Custom ignore patterns (glob support)
  - Analysis modes (conservative/moderate/aggressive)
  - UI customization (default selections, color schemes)
  - Cache settings (duration, location)

## 💾 Installation

```sh
npm install -g packmate
# or
pnpm add -g packmate
# or
yarn global add packmate
```

You can also run it instantly with:

```sh
npx packmate
```

## 📝 Usage

### Basic Usage
From your project root, just run:

```sh
packmate
```

### Enhanced Mode (v2.2.0)
For advanced features including team collaboration and security analysis:

```sh
# Interactive enhanced mode
packmate-enhanced

# Advanced analysis with team policy validation
packmate-enhanced analyze-advanced

# Enhanced security scan with multiple databases
packmate-enhanced security-scan

# Team configuration synchronization
packmate-enhanced team-sync

# Policy compliance checking
packmate-enhanced policy-check
```

### Command Line Options

```sh
# Standard mode
packmate [scan|update|analyze|report]

# Enhanced mode with advanced features
packmate-enhanced [command] [options]

# Available enhanced commands:
#   analyze-advanced  - TypeScript analysis + team policy validation
#   security-scan     - Multi-source security scanning
#   team-sync        - Synchronize team configuration
#   policy-check     - Validate project against team policies
#   cache-optimize   - Optimize cache systems
#   health-check     - System health diagnostics
#   team-setup       - Initialize team configuration

# Options:
#   --project-path   - Specify project directory
#   --deep-scan      - Enable comprehensive security analysis
#   --json           - Output results in JSON format
#   --quiet          - Reduce output verbosity
```

**Typical Workflow Example:**

```sh
┌  📦 Packmate: Dependency Updates & Cleanup
│
◇  Info ─────────────────╮
│  Package Manager: npm  │
├────────────────────────╯
│
Progress |████████████████████████████████████████| 17/17 (100%)
◇  ✅ Found 3 packages with available updates
◇  ✅ Unused package analysis complete
◇  ✅ Found 0 not installed packages

📊 Analysis Results:
   Updates available: 3
   Unused:            1
   Not installed:     0
   Up-to-date:        13

🔶 Major Updates (3)
   ⚠️  Breaking changes possible - Review carefully
│
◇  Select major updates (caution required):
│  ◼ globby  13.2.2 → 15.0.0  [MAJOR]
│  ◻ p-retry  6.2.1 → 7.1.0  [MAJOR]
│  ◻ precinct  10.0.1 → 12.2.0  [MAJOR]
│
⚠️  Proceed with 1 major update(s)? Breaking changes may be included.
│  Yes
│
🗑️  Unused Packages (High Confidence: 1)
   Safe to remove
│
◇  Select packages to remove:
│  none
│
◇  Show already up-to-date packages (13)?
│  No
│
◇  Actions ───────────────────╮
│  📝 Actions to execute:     │
│    - update: globby@15.0.0  │
├─────────────────────────────╯
│
> npm install globby@15.0.0
✔️  Package update completed: globby@15.0.0

✅ Complete:
   Updated:   1
   Removed:   0
   Installed: 0
│
└  Packmate complete! 🎉
```

## ⚙️ Requirements

- Node.js v16 or later (recommended v18+)
- Supports npm, yarn, and pnpm
- Works on Mac, Linux, and Windows

## 🔑 CLI Options

No extra options needed—just run packmate in your project directory.
All selections (update, remove, install) are interactive.

## ⚙️ Configuration

Packmate supports configuration via `packmate.config.json` or the `packmate` field in your `package.json`.

### Example `packmate.config.json`:

```json
{
  "ignorePatterns": ["@types/*", "eslint-*"],
  "analysisMode": {
    "unused": "moderate",
    "devDeps": true
  },
  "ui": {
    "groupSessions": true,
    "colorScheme": "auto",
    "defaultChecked": {
      "updateAvailable": true,
      "unused": false,
      "notInstalled": true,
      "latest": false
    }
  },
  "detection": {
    "dynamicImport": true,
    "conditionalRequire": true,
    "ignoreUnused": [
      "eslint",
      "prettier",
      "jest",
      "webpack"
    ]
  }
}
```

### Configuration Options:

- **ignorePatterns**: Array of glob patterns to ignore packages (e.g., `["@types/*"]`)
- **analysisMode.unused**: Detection mode - `"conservative"` | `"moderate"` | `"aggressive"`
- **analysisMode.devDeps**: Whether to analyze devDependencies separately
- **ui.groupSessions**: Enable grouped UI sessions (Patch/Minor/Major)
- **ui.defaultChecked**: Default selection states for each package type
- **detection.dynamicImport**: Enable dynamic import detection
- **detection.conditionalRequire**: Enable conditional require detection
- **detection.ignoreUnused**: List of packages to always ignore in unused detection

### Cache Management

Packmate automatically caches registry responses for faster subsequent runs. Clear cache if needed:

```bash
# Windows
del /q %TEMP%\packmate-cache\*

# Linux/Mac
rm -rf /tmp/packmate-cache/*
```

Cache location:
- Windows: `C:\Users\<user>\AppData\Local\Temp\packmate-cache`
- Linux/Mac: `/tmp/packmate-cache`

## 🤝 Contributing

Contributions are always welcome! Please feel free to open an issue or submit a pull request.

## 💳 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ljlm0402">AGUMON</a> 🦖
</p>
