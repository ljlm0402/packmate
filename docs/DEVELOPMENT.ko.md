# 추천 순서에 따른 개발 결과

2026-10-15. 초기 검토 이후 resolver·audit 상태 → report → 근거 표시 → 최소 변경 보안 계획 → 복구·workspace 순으로 구현했다. 의존성 자체의 업데이트나 제거, 배포는 수행하지 않았다. 기존 미추적 `packmate.config.json`도 수정하지 않았다.

## 1. Resolver와 audit 상태

`dependency-resolver.js`는 프로젝트별 직접 의존성을 통합한다. optionalDependencies가 같은 이름의 dependencies보다 우선한다. 직접 node_modules와 workspace 루트까지의 hoisted 경로를 확인하고, 없으면 npm의 packages/legacy dependencies, pnpm importer, Yarn Classic/Berry selector를 읽는다. 설치 버전과 lockfile 버전을 별도로 반환하며, `.pnpm` 저장소의 임의 항목이나 선언 범위를 실제 설치 버전으로 간주하지 않는다.

workspace/local/git 계열을 registry 업데이트에서 제외하고, npm alias는 실제 registry 이름으로 조회한다. alias/local specifier의 apply는 지원하지 않는다. 조회 실패·설치 정보 불명·범위 불일치는 `unknown`이며 `current`로 표시하지 않는다. ignored/unsupported도 별도 상태다.

보안 검사는 npm/pnpm JSON, Yarn Classic JSONL 및 Berry npm audit 명령을 공통 형식으로 변환한다. 문자열 via 연결을 순환 방지와 함께 따라가 직접 패키지의 전이 영향을 보존한다. 결과는 `completed`, `disabled`, `unavailable`이며, 실패·시간 초과·미해석 결과를 0건 정상 결과로 간주하지 않는다. 외부 audit 명령은 출력 크기와 실행 시간을 제한한 비동기 runner로 실행한다.

## 2. Report와 CI

```sh
node bin/packmate.js --report
node bin/packmate.js --report --json
node bin/packmate.js --ci --json
node bin/packmate.js --report --offline --json
```

report/CI는 프롬프트, 의존성 변경, 프로젝트 설정 저장, Packmate 디스크 캐시 쓰기를 수행하지 않는다. 분석 모듈은 대화형 모드와 공유한다. offline은 registry 및 audit 호출을 모두 생략한다. 외부 audit 도구 자체의 사용자 홈 로그 등은 Packmate가 관리하는 프로젝트 변경과 별개다.

CI 정책은 0=확인된 문제 없음, 1=업데이트·취약성·미설치 패키지, 2=unknown·보안 검사 불가·사용 분석 불완전·입력 오류다. 불완전 상태를 우선한다. 설정으로 비활성화한 security와 명시적 ignored/unsupported 의존성의 업데이트·미설치 판정은 실패 기준에서 제외한다. ignorePatterns가 보안 권고 자체를 숨기지는 않는다. 정리 후보는 제안이므로 단독으로 CI를 실패시키지 않는다. 일반 report는 분석이 완료되면 내용과 무관하게 0을 반환하고, 입력·실행 오류는 2다.

성공 JSON 계약은 `schemaVersion: 1`이며 다음 필드를 제공한다. 호환되지 않는 구조 변경에는 버전을 올려야 한다.

| 필드 | 의미 |
|---|---|
| packageManager, mode | 선택한 npm/pnpm/yarn 및 online/offline |
| projects[] | path, name, dependencies[], usage, securityPlans[] |
| dependencies[].status | update/current/unknown/ignored/unsupported |
| dependencies[].installedVersion, lockedVersion, source | 설치 확인과 lockfile 확인의 구분 |
| usage.entries[] | used/ignored/candidate/uncertain, confidence, files, reasons |
| usage.errors[], status | 파싱/읽기 실패와 completed/partial 상태 |
| security | status, error, vulnerabilities, grouped, classified, summary |
| securityPlans[] | ready/blocked/not-affected, 이유, 준비된 경우 정확한 목표 버전·범위 변경 여부 |
| workspaceGraph | nodes[], edges[] (from/to/packageName/spec/section) |
| summary | projects/updates/unknown/unsupported/missing/unused |

잘못된 인자·설정·프로젝트 등 분석을 시작/완료할 수 없는 경우 `--json`은 `{ "schemaVersion": 1, "status": "failed", "error": "..." }`를 반환한다. 설명 로그는 stderr로 출력한다. `missing`은 확인 가능한 node_modules 직접 설치 경로가 없다는 의미이며 PnP 설치 증명이 아니다. 보안 건수는 영향 패키지별 권고 수이므로 같은 권고가 직접/전이 패키지에 각각 집계될 수 있다.

정기 workflow는 `npx`로 배포 패키지를 실행하는 대신 현재 checkout의 읽기 전용 CI를 실행하고 JSON artifact를 보존한다. 별도 검증 workflow는 Ubuntu/Windows × Node 18/22를 선언하며, 릴리스 workflow에도 테스트·린트 gate를 추가했다. 원격 workflow 자체는 이 작업 중 실행하지 않았다.

## 3. 근거 표시

사용 분석은 파일별 static/dynamic/conditional reference, lexical/config reference, ignore/dev-tool 제외 이유, 스캔 파일 수, 파싱 오류를 반환한다. 기본 제외 경로(node_modules/.git/.packmate)는 사용자 설정으로 빠져도 강제 유지한다. AST와 import lexical/config 검사 모두 참조를 찾지 못해야 high이며, 단일 분석기 결과는 medium이다. conservative 모드에서는 단일 결과를 후보로 올리지 않는다. 파싱 또는 교차 검사 실패가 있으면 low/uncertain으로 내려 제거 세션에서 제외한다. 계산된 import나 framework convention까지 사용하지 않음을 증명하는 기능은 아니다.

## 4. 최소 변경 보안 계획

`security-plan.js`는 확인 가능한 직접 registry 의존성에 대해 모든 알려진 권고 범위를 벗어나는 안정 버전을 오름차순으로 탐색한다. 선언 범위 내 후보를 먼저 고르고, 없을 때만 범위 외 후보를 제안한다. deprecated, 현재 Node engine 불일치, 확인 가능한 정방향·역방향 peer 제약 불일치는 제외한다. 범위/major 변경을 별도 표시한다. 현재 버전이 이미 권고 범위 밖이면 not-affected다.

전이 영향, 범위 불명, peer 확인 불가, alias/local dependency는 자동 수정 근거가 부족하므로 blocked로 남긴다. 보안 세션은 ready 대상만 선택할 수 있고, blocked 패키지를 일반 latest 업데이트로 우회하지 않는다. 적용 뒤 선택한 패키지 매니저로 audit를 재실행해 결과를 출력하고, 남은 권고 또는 검사 불가를 성공으로 표현하지 않는다. 전체 의존성 그래프의 peer/engine satisfiability를 증명하는 solver는 아니며, 실제 설치 호환성은 패키지 매니저가 검증한다.

## 5. Plan/apply·복구·workspace

```sh
packmate --plan packmate-plan.json --workspaces
packmate --apply packmate-plan.json
packmate --restore <checkpoint-id>
```

계획에는 프로젝트 경로, 현재 버전/선언, 정확한 목표 버전, major/범위 변경 표시와 manifest/lockfile/설정 스냅샷이 담긴다. 보안 최소 변경을 일반 업데이트보다 우선하며, 미사용 자동 제거를 넣지 않는다. 계획 파일은 덮어쓰지 않는다. apply는 모든 명령을 사전 검증하고 스냅샷의 완전성·해시·프로젝트 루트·workspace 경로·중복 작업을 검증한다. 변경된 계획 입력은 다시 생성해야 한다. 확인 프롬프트 기본값은 No이며 무인 실행은 사용자가 `--yes`를 명시해야 한다.

실행 전 `.packmate/checkpoints/<id>.json`에 원본을 저장하고, 실행 후 원본과 동일한 파일 집합의 최종 상태·작업 결과·실패 여부를 기록한다. 첫 실패에서 후속 작업을 중단한다. 최종 checkpoint 갱신은 임시 파일 rename으로 수행한다. restore는 실행 이후 파일 해시가 동일할 때만 원본 내용으로 복구하며, 새로 생성된 lockfile도 제거한다. 경로 탈출과 symlink 경로를 거부한다. 체크포인트와 로컬 설정은 npm 배포 대상에서 제외했다.

workspace는 npm/Yarn의 workspaces 배열·packages 객체와 pnpm-workspace.yaml patterns를 지원한다. workspace별 manifest와 lockfile importer를 분석하고, 로컬 의존성 edges를 별도로 표시한다. 각 패키지의 적용은 해당 프로젝트 디렉터리에서 실행한다. 그래프는 선언된 로컬 관계를 표현하며 실행 순서의 최적화나 그래프 전체의 동시 버전 변경 기능은 제공하지 않는다.

### 리스크와 범위

- restore는 manifest/lockfile/프로젝트 설정 내용만 복원한다. node_modules, Git 상태, lifecycle script의 임의 파일·외부 변경은 복원하지 않는다. 복구 후 패키지 매니저로 재설치해야 한다.
- 복구는 자동 rollback이 아니며, 실행 후 사용자 편집이 있으면 거부한다. 강제 종료/정전으로 최종 상태가 기록되지 않은 incomplete checkpoint도 자동 복구하지 않는다.
- apply와 restore를 같은 프로젝트에서 동시에 실행하는 것은 지원하지 않는다. 오래된 계획의 네트워크 보안 데이터는 apply 직전 새 계획 생성으로 갱신해야 한다.
- lockfile은 읽기 가능한 직접 경로/importer/selector만 사용한다. Yarn PnP 설치 증명, patch/virtual/link를 포함한 모든 lockfile 문법, workspace alias는 완전 지원하지 않는다. 오해석 대신 unknown/unsupported로 남기는 방향이다.
- 모든 권고의 최소 수정이 자동으로 가능하지는 않다. blocked는 사용자가 별도로 검토해야 한다.
- 현재 다중 lockfile이 있는 이 저장소는 기존 로컬 설정을 보존했다. 공식 packageManager 선택과 lockfile 단일화는 별도 결정 사항이다.

## 검증

- `npm test`: 28개 통과. npm/pnpm/Yarn resolver, audit adapters와 전이 via/cycle, JSON/CI 종료 코드, 실제 CLI 무변경 검사, 분석 근거·파싱 실패, 최소 보안 버전·Node/peer 제약, stale/tampered plan 거부, 부분 실패 복구, 복구 시 사용자 변경 보호, workspace 실행 위치, 출력/시간 제한을 검증했다.
- `npm pack --dry-run --json`: 배포 대상 파일 구성 확인. 체크포인트·로컬 설정·테스트 제외 확인.
- `npm run lint`: 오류·경고 0개. 경고 규칙을 완화하지 않고 미사용 코드를 정리했다.
- 이 저장소에서 `--report --offline --json`과 `--help`를 직접 실행했다.
- 실제 의존성 설치·제거·업데이트, live registry/audit 결과, Windows shim, 원격 CI는 검증하지 않았다. 실행 테스트는 일회용 fixture와 주입한 패키지 매니저 결과를 사용했다.

최신 배포 전 실측 검증과 보안 차단 사유는 [2.3.0 최종 점검](RELEASE_CHECK_2.3.0.ko.md)을 참고하세요. 소스가 없는 입력은 manifest-only/partial로 분류하고 제거 후보를 표시하지 않습니다.

보안 의존성 교체 후의 최신 검증은 [audit 실패 해결](SECURITY_REMEDIATION.ko.md)을 참고하세요. 기존의 precinct·depcheck·globby 경로를 TypeScript AST/lexical 분석과 tinyglobby로 교체했으며, 테스트 33개와 전체 prepublish 검증을 통과했습니다.
