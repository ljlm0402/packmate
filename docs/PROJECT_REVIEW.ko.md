# Packmate 전체 코드 분석 및 개선 보고서

> 이 문서는 초기 분석 시점의 기록입니다. 추천 순서에 따른 후속 구현과 최신 검증 결과는 [개발 결과](DEVELOPMENT.ko.md)에 정리했습니다.

분석일: 2026-10-15. 대상: `bin/packmate.js`, `src/` 전체 9개 모듈, 설정 예시, 양 언어 README, 패키지 명세와 lockfile, GitHub Actions. 외부 서비스 호출과 실제 의존성 변경 없이 로컬 코드를 기준으로 분석했다.

## 1. 기능 및 특징

Packmate 2.2.0은 Node.js ESM 기반 대화형 의존성 관리 CLI다. npm/pnpm/yarn을 탐지하고, precinct 소스 분석과 depcheck를 조합해 미사용 후보를 분류한다. package-json으로 최신 버전을 조회하고 semver로 patch/minor/major를 구분한다. npm audit의 direct/transitive 권고를 표시하고, 사용자가 선택·확인한 설치/업데이트/제거를 수행한다.

`config-loader`는 프로젝트 설정을, `enhanced-cache`는 메모리 LRU와 디스크 캐시를, `warning-capture`는 자식 프로세스 출력과 추적을 담당한다. `ui-sessions`는 작업 종류별 선택 UI를 제공한다. 이번에 추가한 `action-runner`는 명령 계획 검증과 실행을 분리한다.

강점은 업데이트·정리·보안을 하나의 선택 흐름으로 묶은 점, 기본적으로 제거를 자동 선택하지 않는 점, 직접·전이 취약성을 구분한 점이다. 파일 분석은 비동기 동시 처리이며 worker thread 기반 CPU 멀티코어 병렬화는 아니다. README의 2–4배 성능 수치는 저장소 내 벤치마크로 입증되지 않는다.

## 2–5. 문제, 해결, 변경 리스크 및 반영 결과

| 문제 | 영향 | 반영한 해결 | 수정 리스크·완화 |
|---|---|---|---|
| precinct가 사용/제외한 항목을 depcheck 단독 결과가 다시 제거 후보로 등록 | 정상 패키지 제거 가능 | precinct의 제외 정책을 통과한 후보만 유지, conservative 모드는 양쪽 탐지 결과만 노출 | 후보 누락 가능. 정리를 보수적으로 제한하고 수동 확인 유지 |
| ignore 패턴의 정규식 특수문자 미이스케이프, ignoreUnused wildcard 미적용 | 예외 또는 잘못된 무시 판단 | `*` 이외 문자는 literal 처리, ignoreUnused에도 같은 매칭 적용 | 기존에 정규식처럼 쓰던 패턴 의미 변경. 문서상 glob 계약에 맞춤 |
| devDeps=false인데 개발 의존성을 제거 후보에 포함 | 설정 위반 | 개발 의존성 후보 제외 | 해당 설정에서 개발 정리 후보 감소 |
| 전용 설정 파일보다 package.json이 우선, prototype 특수 키 허용 | 설정 오동작 | 전용 파일 우선, 위험 키 제외 | 양쪽에 동일 키가 있는 프로젝트의 동작 변경 |
| 깨진 설정 파일 저장 시 원본 덮어쓰기 | 사용자 설정 손실 | 저장 실패로 반환 | 잘못된 JSON은 사용자가 복구해야 저장 가능 |
| 누락 의존성에 latest 설치, 개발 의존성 구분 미보존 | 비의도적 버전 상승·분류 변경 | manifest의 버전 범위와 dependencies/devDependencies/optionalDependencies 구분 유지 | 공백·특수문자가 있는 비표준 specifier는 일부 거부. 모든 명령을 사전 검증해 중간 적용 방지 |
| 문자열 shell 명령을 쓰는 설치 헬퍼 | 명령 해석 위험, 실행 경로 중복 | 공통 action-runner와 인자 배열로 통합. Windows shim은 인자를 인용하고 확장 문자를 거부 | Windows 동작은 로컬 미검증. CI matrix 추가. 헬퍼는 Promise 반환으로 변경되며 저장소 내 기존 호출은 공통 runner로 대체 |
| 보안/일반 업데이트 중복과 제거/설치 충돌 | 재설치·중복 실행·보안 업데이트 후 재변경 | 패키지당 한 작업으로 정규화, 제거/보안 충돌은 기존 사용자 선택 유지 | 보안 업데이트가 일반 업데이트보다 우선하며 latest 사용은 유지 |
| 실패해도 요청 건수를 성공처럼 출력 | 결과 오인, 실패 누적 | 성공/실패/미실행 별도 집계, 첫 실패 중단, 실패 종료 코드 | 이전처럼 실패 후 계속 처리하지 않음. 이미 성공한 작업 자동 rollback은 없음 |
| exit 이벤트에서 출력 집계, spawn 실패 시 종료 콜백 중복 가능 | 경고 누락·프로세스 추적 불일치 | close 이벤트와 출력 조각 버퍼 사용, 종료 추적 일원화 | 일반 출력의 불필요한 줄바꿈도 제거 |
| 메모리 캐시에 TTL 미적용 | 오래된 최신 버전 재사용 | 메모리·디스크 동일 TTL 적용 | 장시간 실행 시 네트워크 조회 증가 |
| audit 오류를 취약성 0건으로 표시 | 보안 상태 오인 | 오류/미지원 응답 실패 처리, disabled/unavailable 상태 구분, audit 60초 제한 | 검사 실패가 더 명확하게 노출됨. 실행 성공을 취약성 해소로 표현하지 않음 |
| CI가 지원되지 않는 --ci로 대화형 CLI 실행 | 무인 작업 오동작 | 인자/비TTY 실행 사전 거부, 기존 정기 workflow는 로컬 테스트·린트로 변경 | 정기 업데이트 탐지 기능은 제공하지 않음. 별도 읽기 전용 report 모드가 후속 과제 |

최종 변경 확인의 기본값도 No로 변경했다. 확인 후에도 실제 패키지 매니저가 lifecycle script를 실행할 수 있고 여러 작업을 하나의 트랜잭션으로 보장하지 않는다. 이번 수정은 의존성 자체의 업데이트·삭제나 릴리스 없이 적용했다. 기존 미추적 `packmate.config.json`은 수정하지 않았다.

## 남아 있는 문제와 후속 해결 방안

1. **보안 데이터 정확도:** npm audit만 사용하므로 pnpm/yarn 전용 lockfile 프로젝트에서는 unavailable이 될 수 있다. 문자열 `via`를 통한 전이 영향 전파를 별도 표현하고, 매니저별 audit adapter와 fixture를 도입해야 한다. 보안 업데이트는 아직 latest이므로 major 가능성을 실제 목표 버전과 함께 사전 확인하고 실행 후 재검사해야 한다.
2. **버전 판정 정확도:** pnpm 저장소에서 이름이 맞는 첫 버전을 선택하고 선언 범위를 coerce하는 경로가 있다. 실제 직접 의존성 resolution과 lockfile importer 기준으로 단일 resolver를 만들고, workspace/link/git/npm alias를 일반 registry 패키지와 구분해야 한다. 조회 실패를 Current로 분류하는 문제도 별도 unknown 상태로 해결해야 한다.
3. **설정 계약:** cache.enabled/memorySize/diskTTL 등은 실제 cache 초기화에 충분히 연결되지 않고 일부 UI 옵션도 미구현이다. groupSessions=false는 구형 백업 파일 안내만 출력한다. 설정 schema와 지원 옵션 표를 만들고 지원되지 않는 설정을 명시적으로 거부해야 한다. ignorePatterns도 분석 종류별 적용 범위를 통일해야 한다.
4. **정적 분석 한계:** Vue/Svelte/템플릿, 계산된 import, CLI scripts, 프레임워크 convention에 대한 탐지 한계가 있다. 파싱 실패를 수집해 신뢰도를 낮추고, 후보별 사용 근거와 실패 파일을 보여줘야 한다. 파일 비동기 동시 처리를 실제 멀티코어 병렬 처리로 표현한 문서는 정정해야 한다.
5. **캐시 견고성:** 전역 캐시의 registry 분리, 동시 프로세스 index 갱신, atomic write, 파일명 충돌, 옵션 검증이 필요하다. 메모리 TTL 외 캐시 구조 변경은 캐시 migration과 장애 테스트를 동반해 분리하는 것이 적절하다.
6. **실행·중단:** 동기 audit는 event loop를 막으며 강제 종료 코드는 child.killed를 종료 완료로 간주한다. 모든 외부 명령을 비동기 추적 경로로 통일하고 close/exitCode 기반 종료와 실행별 시간 제한을 설계해야 한다.
7. **도구 관리:** lockfile 두 종류의 소유권이 불명확하다. 사용자 선택 없이 어느 하나를 삭제하지 않았다. 공식 패키지 매니저를 정하고 packageManager 필드, immutable 설치, 배포 전 테스트를 연계해야 한다. 기존 린트 경고는 남아 있으며 릴리스 workflow에 검증 gate가 없다.

## 6. 검증

- `npm test`: Node 내장 테스트 러너로 8개 테스트 통과. 실제 네트워크·의존성 변경 없이 명령 계획, 실패 시 중단, 입력 검증, 설정 우선순위/보존, glob, 미사용 분석, 프로세스 출력/추적, 캐시 TTL, audit 오류를 검증했다.
- `npm run lint`: 오류 0개, 기존 미사용 변수 경고 16개. 경고를 숨기거나 규칙을 완화하지 않았다.
- CLI를 `--ci`와 비TTY 환경에서 실행: 모두 명시적으로 종료 코드 1 반환, 분석·설치 이전 중단 확인.
- GitHub Actions: Ubuntu/Windows × Node 18/22 검증 matrix 추가. 이 환경에서 원격 CI 실행 결과는 확인하지 않았다.
- macOS 로컬에서만 실행 검증했다. 실제 npm/pnpm/yarn 설치, Windows shim 실행, registry/audit 통합, 대화형 전체 플로우 및 실제 취약성 해소 여부는 검증하지 않았다. 자동 rollback도 구현하지 않았다.

## 7. 추가 기능 및 차별화 전략

우선순위는 시장 조사 결과가 아닌 현재 코드의 강점과 결함을 바탕으로 한 제품 제안이다.

| 순서 | 기능 | 차별화 가치 | 완료 판단 기준 |
|---|---|---|---|
| P0 | 읽기 전용 `--report --json` / `--ci` | 대화형 로컬 도구를 PR·CI에서 같은 분석 기준으로 사용 | 무변경 보장, unknown/failed 구분, 안정적 JSON schema와 정책 종료 코드 |
| P0 | 근거 기반 정리 후보 | ‘왜 미사용인가’를 파일·분석기·제외 규칙으로 설명 | 각 후보의 검출 근거, 파싱 누락과 confidence 제공 |
| P1 | 보안 수정 최소 변경 계획 | 무조건 latest 대신 취약 범위를 벗어나는 최소 변경 제안 | peer/engine/range 제약 검사, 실행 후 audit 재검증 |
| P1 | plan/apply + 체크포인트 | 검토한 동일 계획을 재현하고 부분 실패에서 복구 | manifest/lockfile 해시 검증, diff preview, 복원 정책과 실패 이력 |
| P1 | workspace 영향 지도 | 모노레포에서 패키지별 영향과 업데이트 순서 설명 | npm/pnpm/yarn workspace fixture와 직접·전이 영향 테스트 |
| P2 | 팀 정책과 변경 이력 | 팀별 major/보안/예외 정책을 재사용 | 정책 파일, 승인 기록, 기한 있는 예외, 보고서 export |

추천 개발 순서는 resolver·audit 결과 상태 정비 → report 모드 → 근거 표시 → 최소 변경 보안 계획 → 복구와 workspace 확장이다. 효과는 분석 실패 오표시율, 제거 후보 오탐률, 계획 대비 실제 변경 일치율, CI 수행 시간으로 측정한다.
