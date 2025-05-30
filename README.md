<h1 align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/f42b3836-ac28-4d8a-9d20-bdbd7cc7d8b5" alt="Project Logo" width="140" />
  <br>
  <br>
  PackMate
  <br>
</h1>

<h4 align="center">♻️ Your smart and friendly CLI assistant for dependency updates and cleanup</h4>

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

<br />

---

Packmate is a modern CLI tool for managing, updating, and cleaning up your Node.js project dependencies.
It supports **npm**, **pnpm**, and **yarn**. With an intuitive interactive UI, Packmate helps you keep your project healthy and up-to-date—faster and safer than ever.

## 🤖 Why Packmate?

- Cleaner and more focused than most legacy dependency updaters.
- Safer: latest packages cannot be selected by mistake.
- Faster: only recommended version upgrades are suggested by default.
- Supports monorepos and modern workspaces (pnpm, yarn, npm).

## 🚀 Features

- **Detects outdated dependencies** and suggests updates with recommended (major/minor) versions.
- **Finds and removes unused packages** from your project.
- **Detects declared but not installed packages** and helps install them easily.
- **Protects up-to-date packages:** disables selection for already latest packages.
- **Smart version suggestions**: Only shows the latest version for each major release.
- **Modern CLI interface:** powered by [@clack/prompts](https://github.com/natemoo-re/clack).
- **Works with npm, pnpm, and yarn** – auto-detects your package manager.

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

From your project root, just run:

```sh
packmate
```

**Typical Workflow Example:**

```sh
┌  📦 Packmate: Dependency Updates & Cleanup
│
◆  Select the packages you want to update/remove/install:
│  ◻ globby           13.2.2 → 14.1.0  [Update Available]
│  ◻ precinct         [Not Installed]
│  ◻ chalk            4.1.2            [Unused]
│  ◻ npm-check-updates 16.14.20 → 18.0.1  [Update Available]
│  ◼ @clack/prompts   0.11.0            [Latest]
│  ◼ fs-extra         11.1.1            [Latest]
└

globby - choose a version to update (current: 13.2.2):
 ● 14.1.0 (major) [recommended]
 ○ 13.4.2 (minor) [recommended]
 ○ 13.2.3 (patch)
 ...

precinct is not installed. Install now?
> pnpm add precinct@latest

chalk is unused. Remove now?
> pnpm remove chalk

npm-check-updates - choose a version to update (current: 16.14.20):
 ● 18.0.1 (major) [recommended]
 ○ 17.5.0 (minor)
 ...

> pnpm add globby@14.1.0
> pnpm remove chalk
> pnpm add precinct@latest
> pnpm add npm-check-updates@18.0.1

✔️  Package update completed: globby@14.1.0
✔️  Package removal completed: chalk
✔️  Package install completed: precinct@latest
✔️  Package update completed: npm-check-updates@18.0.1

Packmate done! 🙌
```

## ⚙️ Requirements

- Node.js v16 or later (recommended)
- Supports npm, yarn, and pnpm
- Works on Mac, Linux, and Windows

## 🔑 CLI Options

No extra options needed—just run packmate in your project directory.
All selections (update, remove, install) are interactive.

## 🧑‍💻 Contributing

PRs and issues are welcome!

- Fork the repo and submit pull requests.
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages.
- File bugs or suggestions via [GitHub Issues.](https://github.com/ljlm0402/packmate/issues)

## 📄 License

MIT © [AGUMON (ljlm0402)](mailto:ljlm0402@gmail.com)

## 🌎 Links

- [GitHub](https://github.com/ljlm0402/packmate)
- [npm](https://www.npmjs.com/package/packmate)
