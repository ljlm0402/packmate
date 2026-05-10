<h1 align="center">
  <br>
  <img src="https://github.com/ljlm0402/packmate/raw/images/logo.png" alt="Project Logo" width="600" />
  <br>
  <br>
  PackMate
  <br>
</h1>

<h4 align="center">🤖 스마트하고 친근한 의존성 업데이트 및 정리 CLI 도구</h4>

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
    <strong><a href="./README.md">English</a> · 한국어</strong>
</p>

---

Packmate는 Node.js 프로젝트 의존성을 관리, 업데이트 및 정리하는 현대적인 CLI 도구입니다.

**npm**, **pnpm**, **yarn**을 지원하며, 직관적인 인터랙티브 UI와 강력한 성능 최적화로 프로젝트를 더 빠르고 안전하게 최신 상태로 유지할 수 있습니다.

## 🤖 왜 Packmate인가요?

- **⚡ 성능**: 캐시와 병렬 처리를 활용해 반복 실행 속도를 개선
- **🎯 정확성**: 개발 도구 인텔리전스와 교차 검증 기반의 미사용 패키지 탐지
- **🛡️ 안전성**: 패키지 매니저 스마트 폴백, 미사용 패키지는 업데이트 제외
- **🎨 명료성**: 그룹별 UI 세션 (Patch/Minor/Major) 및 색상 코딩 업데이트
- **🔧 유연성**: `packmate.config.json`을 통한 완전한 설정 지원
- **🌍 현대적**: 깔끔하고 전문적인 인터페이스와 직관적인 워크플로우

## 🚀 주요 기능

### 성능 및 최적화
- **3단계 캐싱 시스템**: 메모리 → 디스크 (1시간 TTL) → 네트워크
  - 첫 실행: 표준 속도
  - 두 번째 실행: 캐시된 레지스트리 데이터로 더 빠르게 동작
- **병렬 처리**: 파일 스캔을 위한 멀티코어 CPU 활용 (**2-4배 빠름**)
- **적응형 동시성**: CPU 코어 기반 동적 요청 제한 (8-16 동시 요청)

### 스마트 탐지
- **향상된 미사용 패키지 탐지**:
  - 동적 import 탐지: `import('module')`
  - 조건부 require 탐지: `try-catch`, `if` 블록
  - DevDependencies 인텔리전스: 빌드 도구, 린터, 타입 정의 인식
  - 교차 검증: precinct + depcheck로 높은 신뢰도
- **업데이트 탐지**:
  - Patch/Minor/Major별 그룹화 및 색상 코딩
  - 미사용 패키지를 업데이트보다 먼저 판단
  - 보안 권고가 있는 direct 의존성 업데이트 후보 표시
  - Semver 기반 버전 비교
- **설치 탐지**: 선언되었지만 설치되지 않은 패키지 찾기

### 뛰어난 UI/UX
- **그룹별 UI 세션**:
  - 🔹 **Patch 업데이트** (녹색): 버그 수정, 안전하게 업데이트
  - 🔸 **Minor 업데이트** (노란색): 새로운 기능, 하위 호환성 유지
  - 🔶 **Major 업데이트** (빨간색): 주요 변경사항, 검토 필요
  - 🗑️ **미사용 패키지**: 높음/중간 신뢰도 레벨
  - 📥 **미설치 패키지**: 누락된 선언 의존성
  - 🛡️ **보안 권고**: direct/transitive 권고 구분
- **안전 기능**:
  - Major 업데이트에 대한 확인 프롬프트
  - 주요 변경사항 경고
  - 명확한 작업 요약
- **시각적 개선**:
  - 색상 코딩된 버전 변경
  - 분석 중 멈춘 것처럼 보이지 않도록 진행 상태 표시
  - 간결한 분석 요약과 최종 작업 검토

### 설정 및 유연성
- **스마트 패키지 매니저 탐지**:
  - 락 파일에서 자동 탐지 (pnpm-lock.yaml, yarn.lock, package-lock.json)
  - 설치 상태 확인
  - 사용 가능한 매니저로 자동 폴백 및 유용한 팁 제공
- **설정 옵션**:
  - 커스텀 무시 패턴 (glob 지원)
  - 분석 모드 (conservative/moderate/aggressive)
  - UI 커스터마이징 (기본 선택, 색상 스킴)
  - 캐시 설정 (기간, 위치)

## 💾 설치

```sh
npm install -g packmate
# 또는
pnpm add -g packmate
# 또는
yarn global add packmate
```

즉시 실행:

```sh
npx packmate
```

## 📝 사용법

프로젝트 루트 디렉토리에서 실행하세요:

```sh
packmate
```

**일반적인 워크플로우 예시:**

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

## ⚙️ 요구사항

- Node.js v18 이상
- npm, yarn, pnpm 지원
- Mac, Linux, Windows에서 작동

## 🔑 CLI 옵션

추가 옵션 없이 프로젝트 디렉토리에서 packmate만 실행하면 됩니다.
모든 선택(업데이트, 제거, 설치)은 인터랙티브로 이루어집니다.

## ⚙️ 설정

Packmate는 `packmate.config.json` 또는 `package.json`의 `packmate` 필드를 통해 설정을 지원합니다.

### `packmate.config.json` 예시:

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

### 설정 옵션:

- **ignorePatterns**: 패키지 무시를 위한 glob 패턴 배열 (예: `["@types/*"]`)
- **analysisMode.unused**: 탐지 모드 - `"conservative"` | `"moderate"` | `"aggressive"`
- **analysisMode.devDeps**: devDependencies를 별도로 분석할지 여부
- **ui.groupSessions**: 그룹별 UI 세션 활성화 (Patch/Minor/Major)
- **ui.defaultChecked**: 각 패키지 유형의 기본 선택 상태
- **detection.dynamicImport**: 동적 import 탐지 활성화
- **detection.conditionalRequire**: 조건부 require 탐지 활성화
- **detection.ignoreUnused**: 미사용 탐지에서 항상 무시할 패키지 목록

### 캐시 관리

Packmate는 더 빠른 후속 실행을 위해 레지스트리 응답을 자동으로 캐시합니다. 필요한 경우 캐시를 지울 수 있습니다:

```bash
# Windows
del /q %TEMP%\packmate-cache\*

# Linux/Mac
rm -rf /tmp/packmate-cache/*
```

캐시 위치:
- Windows: `C:\Users\<user>\AppData\Local\Temp\packmate-cache`
- Linux/Mac: `/tmp/packmate-cache`

## 🤝 기여하기

기여는 언제나 환영합니다! 이슈를 열거나 풀 리퀘스트를 제출해 주세요.

## 💳 라이선스

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ljlm0402">AGUMON</a> 🦖
</p>
