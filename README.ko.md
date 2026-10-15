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

- **⚡ 성능**: 캐시와 비동기 동시 처리를 활용해 반복 실행 속도를 개선
- **🎯 정확성**: 개발 도구 인텔리전스와 교차 검증 기반의 미사용 패키지 탐지
- **🛡️ 안전성**: 패키지 매니저 스마트 폴백, 미사용 패키지는 업데이트 제외
- **🎨 명료성**: 그룹별 UI 세션 (Patch/Minor/Major) 및 색상 코딩 업데이트
- **🔧 유연성**: `packmate.config.json`을 통한 프로젝트별 설정 지원
- **🌍 현대적**: 깔끔하고 전문적인 인터페이스와 직관적인 워크플로우

## 🚀 주요 기능

### 성능 및 최적화

- **3단계 캐싱 시스템**: 메모리 → 디스크 (1시간 TTL) → 네트워크
  - 첫 실행: 표준 속도
  - 두 번째 실행: 캐시된 레지스트리 데이터로 더 빠르게 동작
- **⚡ 동시 처리**: 비동기 파일 스캔 (worker thread 기반 CPU 병렬화 아님)
- **적응형 동시성**: CPU 코어 기반 동적 요청 제한 (레지스트리 최대 12개, 보안 메타데이터 최대 4개)

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
  - 🔹 **Patch 업데이트** (녹색): 버그 수정, 변경 내역 검토
  - 🔸 **Minor 업데이트** (노란색): 기능 변경, 호환성 검토
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
  - 커스텀 패키지 무시 패턴 (`*` wildcard 지원)
  - 분석 모드 (conservative/moderate/aggressive)
  - UI 세션별 기본 선택 설정
  - 캐시 설정 (기간, 위치)

### 📊 보고서 및 자동화

- **읽기 전용 분석**: 텍스트·JSON 보고서, CI 종료 코드, 오프라인 모드
- **판단 근거 표시**: 참조 파일·제외 이유·파싱 오류와 신뢰도 제공
- **보수적인 정리**: 소스가 없거나 분석이 불완전하면 제거 후보로 제안하지 않음
- **워크스페이스 분석**: npm/Yarn/pnpm 프로젝트별 결과와 로컬 의존 관계 제공

### 🛡️ 보안 계획 및 복구

- **패키지 매니저별 audit**: npm/pnpm/Yarn의 직접·전이 보안 권고 구분
- **최소 변경 제안**: 선언 범위 내 안정 버전을 우선하고 Node·확인 가능한 peer 제약 검사
- **검토 가능한 실행**: plan/apply, 입력 해시 검증, 실패 시 후속 작업 중단
- **체크포인트 복구**: 추가 편집을 보호하면서 manifest·lockfile·설정 파일 복원

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

Yarn 전역 설치 예시는 Yarn Classic 기준입니다. 배포 전 2.3.0 소스를 사용하려면 저장소에서 `npm ci` 후 분석할 프로젝트 디렉터리에서 진입점을 실행하세요.

```sh
node /path/to/packmate/bin/packmate.js --report
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

위 화면은 흐름을 설명하기 위한 예시입니다. 최종 확인 기본값은 **No**이며, 설치 시 선언 버전과 의존성 구분을 유지합니다. 실패하면 후속 작업을 중단합니다.

### 📊 보고서 및 CI

```sh
packmate --report
packmate --report --json
packmate --report --offline --json
packmate --ci --json > packmate-report.json
```

보고서 모드는 패키지를 설치하거나 manifest·lockfile·설정을 변경하지 않으며 Packmate 디스크 캐시도 쓰지 않습니다. 오프라인 분석은 확인하지 못한 버전을 `unknown`, 보안 결과를 `unavailable`로 남깁니다. 외부 패키지 매니저는 자체 사용자 로그를 기록할 수 있습니다.

#### CI 종료 코드

| 코드 | 의미                                                        |
| ---- | ----------------------------------------------------------- |
| `0`  | 활성화된 정책 기준으로 발견된 문제 없음                     |
| `1`  | 업데이트·보안 권고·미설치 패키지 발견                       |
| `2`  | 분석 불완전, audit 불가, 버전 확인 불가 또는 명령·입력 오류 |

불완전 상태를 우선 반환합니다. 명시적으로 제외하거나 지원하지 않는 의존성은 업데이트·미설치 실패 판정에서 제외하지만, `ignorePatterns`가 보안 권고 자체를 숨기지는 않습니다. 정리 후보만으로 CI를 실패시키지 않습니다. 일반 `--report`는 분석 결과에 관계없이 완료 시 `0`, 명령·입력 오류 시 `2`를 반환합니다.

#### JSON 결과

정상 결과는 `schemaVersion: 1`과 `packageManager`, `mode`, `summary`, `projects`, `workspaceGraph`, `security`를 포함합니다. 프로젝트별로 의존성 상태, 사용 근거·오류, 보안 수정 제안을 제공합니다.

- 의존성 상태: `update`, `current`, `unknown`, `ignored`, `unsupported`.
- 사용 분석 상태: `used`, `ignored`, `candidate`, `uncertain`. coverage로 소스 파일 분석과 manifest 전용 입력을 구분합니다.
- 보안 검사 상태: `completed`, `disabled`, `unavailable`.
- 보안 수정 제안 상태: `ready`, `blocked`, `not-affected`.

분석을 완료할 수 없는 명령에서 `--json`을 요청하면 `schemaVersion: 1`, `status: "failed"`, `error` 메시지를 출력합니다. 권고 건수는 영향 패키지별 집계이므로 고유 advisory ID 개수와 다를 수 있습니다.

### 🛡️ 보안 업데이트 계획

선택한 패키지 매니저로 audit를 실행하며 Yarn Classic JSONL과 Yarn Berry의 npm audit 명령을 처리합니다. 전이 `via` 관계도 유지해 간접적으로 영향을 받는 직접 패키지를 누락하지 않습니다.

지원하는 직접 레지스트리 의존성에 대해 안정 버전을 오름차순으로 탐색합니다. 선언 범위 내 수정을 먼저 찾고, deprecated 버전·현재 Node engine·확인 가능한 정방향 및 역방향 peer 제약을 검사합니다. Major·범위 변경이 필요하면 검토 표시를 남깁니다.

전이 권고, 불완전한 범위, 검증 불가 호환성은 `blocked`로 남깁니다. 보안 작업 적용 후에는 audit를 다시 실행합니다. 설치 명령 성공만으로 취약성 해소를 보장하지 않으며, 전체 설치 호환성은 패키지 매니저가 확인합니다.

### 💾 계획 생성·실행·복구

```sh
# 의존성을 바꾸지 않고 계획을 생성합니다.
packmate --plan packmate-plan.json

# 파일을 검토한 뒤 실행을 확인합니다.
packmate --apply packmate-plan.json

# apply가 출력한 체크포인트 ID를 사용합니다.
packmate --restore CHECKPOINT_ID
```

계획은 현재·목표 버전, 워크스페이스 경로, manifest·lockfile·프로젝트 설정의 스냅샷을 포함합니다. 기존 계획 파일은 덮어쓰지 않습니다. 자동 생성 계획은 검증한 보안 수정을 우선하며, 미사용 패키지 자동 제거를 포함하지 않습니다.

apply는 모든 작업을 먼저 검증하고, 프로젝트 스냅샷이 바뀌었거나 누락·불일치가 있으면 명령 실행 전에 중단합니다. 복구 정보는 `.packmate/checkpoints/`에 저장합니다. restore는 실행 후 추가로 편집한 파일을 덮어쓰지 않습니다.

**복구 대상은 추적한 프로젝트 파일입니다.** `node_modules`와 lifecycle script의 부수 효과는 복원하지 않으므로 복구 후 패키지 매니저로 재설치해야 합니다. 자동 rollback이 아닌 명시적 복구이며, 강제 중단으로 불완전해진 체크포인트는 자동 복구할 수 없습니다. 같은 프로젝트에서 apply·restore를 동시에 실행하지 마세요.

자동화에서는 `--yes`로 실행 의사를 명시합니다.

```sh
packmate --apply packmate-plan.json --yes
packmate --restore CHECKPOINT_ID --yes
```

### 🧩 워크스페이스 및 패키지 매니저 선택

모노레포 루트에서 실행합니다.

```sh
packmate --report --workspaces --json
packmate --plan workspace-plan.json --workspaces
packmate --apply workspace-plan.json
```

npm/Yarn의 `workspaces` 배열·`workspaces.packages`와 `pnpm-workspace.yaml` 패턴을 읽습니다. 프로젝트별 분석 결과와 선언된 로컬 의존 관계를 보고하며, 로컬 워크스페이스 연결은 레지스트리 업데이트·제거 제안에서 제외합니다. 실제 작업은 대상 프로젝트 디렉터리에서 실행합니다.

무인 모드에서는 Packmate 설정의 `packageManager`, 프로젝트 manifest의 `packageManager`, lockfile 순서로 선택합니다. 여러 lockfile이 충돌하면 명시적 설정이 필요합니다. 대화형 모드에서는 사용할 매니저를 선택하고 설정 저장을 제안받을 수 있습니다.

## ⚙️ 요구사항

- Node.js v18 이상 (패키지 명세의 npm 요구사항: v9 이상)
- 패키지 작업과 온라인 audit를 위한 npm, Yarn 또는 pnpm
- 기본 모드에는 대화형 터미널 필요. 보고서·CI는 무인 실행 지원
- macOS의 Node 18.14·22.16에서 검증. Windows CI는 구성했으나 성공 결과는 미확인

## 🔑 CLI 옵션

| 명령·옵션                   | 용도                                                     |
| --------------------------- | -------------------------------------------------------- |
| `packmate`                  | 대화형 분석 및 작업 선택                                 |
| `--help`                    | 사용 가능한 명령어 안내                                  |
| `--report`                  | 읽기 전용 텍스트 보고서                                  |
| `--json`                    | `--report`, `--ci`, `--plan`의 JSON 출력                 |
| `--ci`                      | 정책 종료 코드를 반환하는 읽기 전용 보고서               |
| `--offline`                 | 레지스트리·audit 호출 생략. 보고서·계획 모드와 함께 사용 |
| `--workspaces`              | 선언된 워크스페이스 포함. 보고서·계획 모드와 함께 사용   |
| `--plan <file>`             | 새 업데이트 계획 파일 생성 및 분석 보고서 출력           |
| `--apply <file>`            | 계획 확인 후 실행                                        |
| `--restore <checkpoint-id>` | 확인 후 추적 대상 프로젝트 파일 복구                     |
| `--yes`                     | apply·restore에만 사용하는 명시적 무인 실행 확인         |

`--plan`, `--apply`, `--restore`는 한 번에 하나만 선택합니다. apply·restore에는 보고서 옵션을 결합할 수 없으며, apply는 계획에 저장된 워크스페이스 정보를 사용합니다.

## ⚙️ 설정

`packmate.config.json` 또는 `package.json`의 `packmate` 필드에 설정합니다. **전용 설정 파일이 우선합니다.** 배열은 해당 기본 배열에 추가되지 않고 대체됩니다.

### `packmate.config.json` 예시

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

### 설정 옵션

| 설정                     | 동작                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `packageManager`         | `npm`, `pnpm`, `yarn` 명시적 선택                                                       |
| `ignorePatterns`         | 업데이트·미설치 판정 및 정리에서 제외할 패키지. `*` wildcard 지원                       |
| `analysisMode.unused`    | `conservative`는 양쪽 분석기 확인 필요. 현재 `moderate`·`aggressive`의 후보 정책은 동일 |
| `analysisMode.devDeps`   | 개발 의존성을 미사용 분석에 포함할지 여부                                               |
| `ui.defaultChecked`      | 업데이트·제거·미설치 세션의 초기 선택                                                   |
| `security.*`             | audit 활성화와 우선순위별 세션 선택 설정                                                |
| `detection.ignoreUnused` | 미사용 정리 제외 목록. `*` wildcard 지원                                                |
| `detection.ignorePaths`  | 소스 스캔 제외 경로. node_modules·.git·.packmate는 항상 제외                            |
| `cache.*`                | 대화형 레지스트리 캐시 설정. `diskTTL` 단위는 밀리초                                    |

대화형 모드에서 `ui.groupSessions`는 활성화해야 하며, 비활성화는 지원하지 않습니다. 기존 필드인 `ui.colorScheme`, `security.sources`, `cache.maxAge`는 현재 별도 동작을 제공하지 않아 예시에서 제외했습니다.

### 캐시 관리

대화형 조회는 메모리 LRU → 디스크 → 레지스트리 순서로 동작하며 두 캐시 계층의 기본 TTL은 1시간입니다. 파일 작업은 worker thread가 아닌 비동기 동시 처리입니다. 레지스트리 동시 요청은 CPU 기준 최대 12개, 보안 메타데이터 조회는 최대 4개입니다. 보고서·CI 모드는 디스크 캐시를 사용하지 않습니다.

기본 경로는 Node의 `os.tmpdir()` 아래 `packmate-cache`입니다. macOS에서도 고정 경로를 가정하지 않고 실제 경로를 확인하세요.

```sh
node -p "require('node:path').join(require('node:os').tmpdir(), 'packmate-cache')"
```

`cache.directory`로 경로를 지정할 수 있습니다.

## ⚠️ 현재 제한사항

- 계산된 import, 프레임워크 관례, 미지원 파일 형식까지 정적 분석으로 미사용을 증명하지는 않습니다.
- npm alias는 실제 레지스트리 이름으로 조회하지만 alias·local·git specifier의 apply는 지원하지 않습니다.
- 직접 lockfile 경로·importer·selector를 처리하며, Yarn PnP 설치 판정과 모든 patch·virtual 문법을 완전히 지원하지는 않습니다.
- 워크스페이스 그래프는 선언된 관계를 표현하며 전체 그래프의 호환성 계산이나 연동 버전 마이그레이션을 제공하지 않습니다.
- macOS의 Node 18.14·22.16에서 로컬 검증했습니다. Windows CI는 구성되어 있으나 성공 실행 결과는 확인하지 않았습니다.

## 🛠️ 개발 및 배포 검증

```sh
npm ci
npm test
npm run lint
npm run check:package
npm run prepublishOnly
```

마지막 명령은 테스트·린트·패키지 검사와 `npm audit --omit=dev --audit-level=high`를 실행하며 배포하지 않습니다. 미해결 high 이상 권고가 있으면 배포를 중단하며, 마지막 보안 점검에는 미해결 권고가 남아 있습니다. 릴리스 workflow는 Git tag와 `package.json`의 버전 일치도 검사합니다.

구현 및 검증 범위는 [개발 결과](https://github.com/ljlm0402/packmate/blob/master/docs/DEVELOPMENT.ko.md), [배포 점검](https://github.com/ljlm0402/packmate/blob/master/docs/RELEASE_CHECK_2.3.0.ko.md)을 참고하세요.

## 🤝 기여하기

기여는 언제나 환영합니다! 이슈를 열거나 풀 리퀘스트를 제출해 주세요.

## 💳 라이선스

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ljlm0402">AGUMON</a> 🦖
</p>
