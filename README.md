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

- **⚡ Performance**: Faster repeat runs with caching and asynchronous analysis
- **🎯 Accuracy**: Unused package detection with dev tool intelligence and cross-validation
- **🛡️ Safety**: Smart fallback for package managers, unused packages excluded from updates
- **🎨 Clarity**: Grouped UI sessions (Patch/Minor/Major) with color-coded updates
- **🔧 Flexibility**: Project-level configuration via `packmate.config.json`
- **🌍 Modern**: Clean, professional English interface with intuitive workflows

## 🚀 Features

### Performance & Optimization

- **3-Level Caching System**: Memory → Disk (1hr TTL) → Network
  - First run: Standard speed
  - Second run: Faster with cached registry data
- **⚡ Concurrent Processing**: Asynchronous file scanning (not worker-thread CPU parallelism)
- **Adaptive Concurrency**: Dynamic request throttling based on CPU cores (registry cap: 12; security metadata cap: 4)

### Security Awareness

- **Security Advisories**:
  - npm/pnpm/Yarn audit adapters
  - Direct/transitive advisory distinction
  - Security update candidates in the interactive flow
  - Transitive advisories explained without misleading direct selection

### Smart Detection

- **Enhanced Unused Detection**:
  - Dynamic import detection: `import('module')`
  - Conditional require detection: `try-catch`, `if` blocks
  - DevDependencies intelligence: Recognizes build tools, linters, type definitions
  - Cross-validation: TypeScript AST analysis plus import scanning and configuration references
- **Update Detection**:
  - Grouped by Patch/Minor/Major with color coding
  - Unused packages are reviewed before update selection
  - Direct security advisories can be surfaced in the update flow
  - Semver-aware version comparison
- **Installation Detection**: Finds declared but not installed packages

### UI/UX Excellence

- **Grouped UI Sessions**:
  - 🔹 **Patch Updates** (Green): Bug fixes; review the changes
  - 🔸 **Minor Updates** (Yellow): Feature changes; review compatibility
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
  - Custom package ignore patterns (`*` wildcards)
  - Analysis modes (conservative/moderate/aggressive)
  - Default selections for interactive sessions
  - Cache settings (duration, location)

### 📊 Reports & Automation

- **Read-only analysis**: Text/JSON reports, CI exit codes, and offline mode
- **Usage evidence**: Reference files, exclusion reasons, parsing errors, and confidence
- **Conservative cleanup**: Missing source files or incomplete analysis suppress removal proposals
- **Workspace analysis**: Per-project results and local dependency edges for npm/Yarn/pnpm

### 🛡️ Security Plans & Recovery

- **Manager-specific audit**: Direct/transitive advisories for npm/pnpm/Yarn
- **Minimal change proposals**: Prefer stable in-range fixes and check Node and known peer constraints
- **Reviewable execution**: Plan/apply, input hashes, and stop-on-failure behavior
- **Recovery checkpoints**: Restore manifests, lockfiles, and settings without overwriting later edits

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

The Yarn global-install example applies to Yarn Classic. To use the unreleased 2.3.0 source, run `npm ci` in the repository, then invoke its entry point from the target project:

```sh
node /path/to/packmate/bin/packmate.js --report
```

## 📝 Usage

### Basic Usage

From your project root, just run:

```sh
packmate
```

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
    - lodash → verified target (high)
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

The screen above illustrates the workflow. Final confirmation defaults to **No**. Missing-package installation preserves declared specs and dependency sections; execution stops after a failure.

### 📊 Reports & CI

```sh
packmate --report
packmate --report --json
packmate --report --offline --json
packmate --ci --json > packmate-report.json
```

Report modes do not install packages, change manifests/lockfiles/settings, or write Packmate disk caches. Offline analysis retains `unknown` versions and `unavailable` security results. External package managers may maintain their own user-level logs.

#### CI exit codes

| Code | Meaning                                                                            |
| ---- | ---------------------------------------------------------------------------------- |
| `0`  | No findings under the enabled policy                                               |
| `1`  | Updates, advisories, or missing packages found                                     |
| `2`  | Incomplete analysis, unavailable audit, unknown versions, or a command/input error |

Incomplete results take precedence over findings. Explicitly ignored or unsupported dependencies do not fail update/missing checks; `ignorePatterns` does not hide security advisories. Cleanup suggestions alone do not fail CI. Ordinary `--report` returns `0` after analysis even when findings exist; command/input errors return `2`.

#### JSON output

Successful output uses `schemaVersion: 1` with `packageManager`, `mode`, `summary`, `projects`, `workspaceGraph`, and `security`. Each project includes dependency states, usage evidence/errors, and security proposals.

- Dependency states: `update`, `current`, `unknown`, `ignored`, `unsupported`.
- Usage states: `used`, `ignored`, `candidate`, `uncertain`; coverage distinguishes source files from manifest-only input.
- Security states: `completed`, `disabled`, `unavailable`.
- Security proposal states: `ready`, `blocked`, `not-affected`.

A command that cannot complete analysis emits `schemaVersion: 1`, `status: "failed"`, and an `error` message when `--json` is requested. Advisory counts describe affected package/advisory pairs, not necessarily unique advisory IDs.

### 🛡️ Security Update Planning

Packmate reads audit data using the selected package manager, including Yarn Classic JSONL and Yarn Berry's npm audit command. It preserves transitive `via` relationships instead of dropping indirectly affected direct packages.

For a supported direct registry dependency, the planner searches stable, non-deprecated versions in ascending order. It prefers a fix inside the declared range and checks the current Node engine and known forward/reverse peer constraints. A required major/range change is flagged for review.

Inherited advisories, incomplete ranges, or unverifiable compatibility remain `blocked`. Security actions are audited again after execution. A completed install command alone does not prove that advisories were resolved; full installation compatibility is still checked by the package manager.

### 💾 Plan, Apply & Recovery

```sh
# Write a plan without changing dependencies.
packmate --plan packmate-plan.json

# Review the file, then confirm execution.
packmate --apply packmate-plan.json

# Use the checkpoint ID printed by apply.
packmate --restore CHECKPOINT_ID
```

Plans include current/target versions, workspace paths, and snapshots of manifests, lockfiles, and project settings. Existing plan files are never overwritten. Generated plans prioritize verified security fixes and do not automatically remove unused packages.

Apply validates every action and rejects changed, incomplete, or mismatched project snapshots before running a command. It saves recovery records under `.packmate/checkpoints/`. Restore refuses to overwrite edits made after execution.

**Recovery restores tracked project files only.** It does not restore `node_modules` or lifecycle-script side effects. Reinstall with your package manager after restoring. Recovery is explicit; it is not automatic rollback. Incomplete checkpoints after a hard interruption cannot be restored automatically. Do not run concurrent apply/restore operations in the same project.

For automation, explicitly authorize the operation with `--yes`:

```sh
packmate --apply packmate-plan.json --yes
packmate --restore CHECKPOINT_ID --yes
```

### 🧩 Workspaces & Package Manager Selection

Run from the monorepo root:

```sh
packmate --report --workspaces --json
packmate --plan workspace-plan.json --workspaces
packmate --apply workspace-plan.json
```

Packmate reads npm/Yarn `workspaces` arrays or `workspaces.packages`, and `pnpm-workspace.yaml` patterns. Reports include per-project results and declared local dependency edges. Local workspace dependencies are excluded from registry update and removal proposals. Operations execute in the target project directory.

For unattended modes, manager selection uses `packmate.config.json` / the `packmate` field, then the manifest's `packageManager`, then lockfiles. Ambiguous lockfiles require an explicit preference. Interactive mode can prompt for a manager and offer to save it.

## ⚙️ Requirements

- Node.js v18 or later (package metadata specifies npm v9 or later)
- npm, Yarn, or pnpm for package operations and online audit
- Interactive terminal for default mode; reports/CI support unattended execution
- Tested on macOS with Node 18.14 and 22.16; Windows CI is configured but not confirmed

## 🔑 CLI Options

| Command / option            | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `packmate`                  | Interactive analysis and action selection                      |
| `--help`                    | Show available commands                                        |
| `--report`                  | Read-only text report                                          |
| `--json`                    | JSON output with `--report`, `--ci`, or `--plan`               |
| `--ci`                      | Read-only report with policy exit codes                        |
| `--offline`                 | Skip registry and audit calls; combine with a report/plan mode |
| `--workspaces`              | Include declared workspaces; combine with a report/plan mode   |
| `--plan <file>`             | Write a new update plan and show the analysis report           |
| `--apply <file>`            | Confirm and execute a plan                                     |
| `--restore <checkpoint-id>` | Confirm and restore tracked project files                      |
| `--yes`                     | Explicit unattended confirmation for apply/restore only        |

Choose one of `--plan`, `--apply`, and `--restore`. Apply/restore cannot be combined with report options; apply uses the workspace information already stored in the plan.

## ⚙️ Configuration

Set options in `packmate.config.json` or the `packmate` field of `package.json`. **The dedicated config file takes precedence.** Arrays replace the corresponding default arrays.

### Example `packmate.config.json`

```json
{
  "packageManager": "npm",
  "ignorePatterns": ["@types/*"],
  "analysisMode": {
    "unused": "conservative",
    "devDeps": true
  },
  "ui": {
    "groupSessions": true,
    "defaultChecked": {
      "updateAvailable": true,
      "unused": false,
      "notInstalled": true
    }
  },
  "security": {
    "enabled": true,
    "autoSelectCritical": true,
    "autoSelectHigh": true,
    "showLowPriority": false
  },
  "detection": {
    "dynamicImport": true,
    "conditionalRequire": true,
    "ignoreUnused": ["eslint", "prettier", "typescript"]
  },
  "cache": {
    "enabled": true,
    "memorySize": 1000,
    "diskTTL": 3600000,
    "showStats": true,
    "autoCleanup": true
  }
}
```

### Configuration Options

| Setting                  | Behavior                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `packageManager`         | Explicit `npm`, `pnpm`, or `yarn` preference                                                                 |
| `ignorePatterns`         | Package-name exclusions for update/missing checks and cleanup; supports `*` wildcards                        |
| `analysisMode.unused`    | `conservative` requires both scanners; `moderate` and `aggressive` currently share the same candidate policy |
| `analysisMode.devDeps`   | Include development dependencies in unused analysis                                                          |
| `ui.defaultChecked`      | Initial selections for update, removal, and missing-package sessions                                         |
| `security.*`             | Enable audit and configure priority-session selections                                                       |
| `detection.ignoreUnused` | Cleanup exclusions with `*` wildcards                                                                        |
| `detection.ignorePaths`  | Source-scan exclusions; node_modules, .git, and .packmate remain excluded                                    |
| `cache.*`                | Interactive registry-cache settings; `diskTTL` is in milliseconds                                            |

Keep `ui.groupSessions` enabled for interactive use; disabling it is unsupported. Legacy fields such as `ui.colorScheme`, `security.sources`, and `cache.maxAge` do not currently provide separate behavior and are omitted from this example.

### Cache Management

Interactive lookups use memory LRU → disk → registry, with a default one-hour TTL on both cache layers. File work is asynchronous, not worker-thread CPU parallelism. Registry concurrency is CPU-based and capped at 12; security metadata lookups are capped at 4. Report/CI modes bypass disk caching.

The default directory is `packmate-cache` inside Node's `os.tmpdir()`. Print the actual location rather than assuming a fixed path on macOS:

```sh
node -p "require('node:path').join(require('node:os').tmpdir(), 'packmate-cache')"
```

`cache.directory` overrides the cache path.

## ⚠️ Current Limitations

- Static analysis does not prove non-use for computed imports, framework conventions, or unsupported file formats.
- npm aliases can be reported using their registry target, but applying alias/local/git specifiers is unsupported.
- Direct lockfile paths/importers/selectors are supported; complete Yarn PnP installation detection and every patch/virtual lockfile form are not.
- Workspace graphs describe declared local relationships; they do not provide a whole-graph compatibility solver or coordinated version migrations.
- Compatibility was tested locally on macOS with Node 18.14 and 22.16. Windows CI is configured, but a successful Windows run has not been confirmed.

## 🛠️ Development & Release Checks

```sh
npm ci
npm test
npm run lint
npm run check:package
npm run prepublishOnly
```

The last command runs tests, lint, package checks, and `npm audit --omit=dev --audit-level=high`; it does not publish. Unresolved high-severity findings block publication; after replacing vulnerable analysis dependencies, both runtime and full dependency audits returned zero findings. The release workflow also requires its Git tag to match `package.json`.

See the [development notes](https://github.com/ljlm0402/packmate/blob/master/docs/DEVELOPMENT.ko.md), and the [release check](https://github.com/ljlm0402/packmate/blob/master/docs/RELEASE_CHECK_2.3.0.ko.md) for implementation details and validation scope.

## 🤝 Contributing

Contributions are always welcome! Please feel free to open an issue or submit a pull request.

## 💳 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ljlm0402">AGUMON</a> 🦖
</p>
