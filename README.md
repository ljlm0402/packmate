<h1 align="center">
  <br>
  <img src="https://github.com/ljlm0402/packmate/raw/images/logo.png" alt="Project Logo" width="600" />
  <br>
  <br>
  PackMate
  <br>
</h1>

<h4 align="center">🤖 Your smart and friendly interactive CLI assistant for dependency updates, security advisories, and cleanup</h4>

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

- **⚡ Performance**: Faster repeat runs with caching and parallel analysis
- **🎯 Accuracy**: Unused package detection with dev tool intelligence and cross-validation
- **🛡️ Safety**: Smart fallback for package managers, unused packages excluded from updates
- **🎨 Clarity**: Grouped UI sessions (Patch/Minor/Major) with color-coded updates
- **🔧 Flexibility**: Full configuration support via `packmate.config.json`
- **🌍 Modern**: Clean, professional English interface with intuitive workflows

## 🚀 Features

### Performance & Optimization
- **3-Level Caching System**: Memory → Disk (1hr TTL) → Network
  - First run: Standard speed
  - Second run: Faster with cached registry data
- **Worker Pool Processing**: Multi-core CPU utilization for file scanning (**2-4x faster**)
- **Compressed Caching**: Experimental Brotli-based cache storage
- **Predictive Caching**: Experimental package prediction and pre-loading
- **Adaptive Concurrency**: Dynamic request throttling based on CPU cores (8-16 concurrent)

### Security Awareness
- **Security Advisories**:
  - npm audit based advisory detection
  - Direct/transitive advisory distinction
  - Security update candidates in the interactive flow
  - Transitive advisories explained without misleading direct selection

### Smart Detection
- **Enhanced Unused Detection**:
  - Dynamic import detection: `import('module')`
  - Conditional require detection: `try-catch`, `if` blocks
  - DevDependencies intelligence: Recognizes build tools, linters, type definitions
  - Cross-validation: precinct + depcheck for high confidence
- **Update Detection**:
  - Grouped by Patch/Minor/Major with color coding
  - Unused packages are reviewed before update selection
  - Direct security advisories can be surfaced in the update flow
  - Semver-aware version comparison
- **Installation Detection**: Finds declared but not installed packages

### UI/UX Excellence
- **Grouped UI Sessions**:
  - 🔹 **Patch Updates** (Green): Bug fixes, safe to update
  - 🔸 **Minor Updates** (Yellow): New features, backward compatible
  - 🔶 **Major Updates** (Red): Breaking changes, requires review
  - 🗑️ **Unused Packages**: High/Medium confidence levels
  - 📥 **Not Installed**: Missing declared dependencies
  - 🛡️ **Security Advisories**: Direct/transitive advisory distinction
- **Safety Features**:
  - Confirmation prompt for major updates
  - Breaking change warnings
  - Clear action summaries
- **Visual Enhancements**:
  - Color-coded version changes
  - Progressive feedback during analysis
  - Compact summary and final action review

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

### Command Line Options

```sh
packmate
```

Packmate is intentionally interactive. Run it from your project directory and choose updates, removals, and security actions from the guided prompts.

**Typical Workflow Example:**

```sh
┌  📦 Packmate: Dependency Updates & Cleanup
│
◇  Multiple lock files found. Which package manager should PackMate use?
│  pnpm

Analysis Summary
  Category   Count         Details
  Updates    7             Available package updates
  Unused     1             Possible cleanup candidates
  Missing    0             Declared but not installed
  Current    9             Already up-to-date
  Security   2 advisories  1 direct, 1 transitive

🗑️  Unused Packages (High Confidence: 1)
   Likely safe to remove
│
◇  Select packages to remove:
│  none

Security Risk: High (1)
   Update recommended
│
◇  Select security updates:
│  lodash  2 advisories

🔶 Major Updates (3)
   ⚠️  Breaking changes possible - Review carefully
│
◇  Select major updates (caution required):
│  none

Review Actions
  Security updates (1)
    - lodash (high)
  Updates (2)
    - fs-extra → 11.3.5
    - js-yaml → 4.1.1
│
◇  Proceed with 3 action(s)?
│  No
│
No changes were made.
│
└  Packmate complete! 🎉
```

## ⚙️ Requirements

- Node.js v18 or later
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
