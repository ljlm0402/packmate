# 배포 audit 실패 해결

검증일: 2026-10-15. publish.yml의 high 이상 audit 기준과 prepublishOnly를 유지한 상태에서 모든 검증을 통과했다. npm publish·tag 생성·push는 실행하지 않았다.

## 원인과 해결

이전 high 9·moderate 3은 두 취약 패키지의 영향이 여러 의존성에 전파된 결과였다.

- [braces 권고](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): 수정 버전이 없는 `braces <=3.0.3`이 globby/precinct/depcheck의 전이 의존성에 포함되었다.
- [sprintf-js 권고](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): depcheck의 js-yaml@3 → argparse 경로에 포함되었다.

검사를 생략하거나 audit-level을 올리지 않았다. force가 제안한 depcheck/globby 과거 버전으로 이동하지 않았고, Node 20 이상을 요구하는 precinct 13으로 올리지도 않았다.

대신 다음과 같이 교체했다.

| 변경 | 기능 보존 및 검증 |
|---|---|
| globby → tinyglobby 0.2.17 계열 | 파일 스캔과 workspace의 brace/negation 패턴, symlink 제외 유지. 디렉터리 후행 slash를 정규화해 계획 경로 보존 |
| precinct → TypeScript 5.9.3 계열 AST | JS/TS/JSX/TSX/MJS/CJS/MTS/CTS의 import/export, type import, require/resolve, 조건부 require, 동적 import 처리 |
| depcheck → import lexical pass + 설정 참조 분석 | TypeScript preProcessFile과 package scripts·설정·설치된 CLI bin 이름을 교차 확인. 사용자 설정을 실행하지 않음 |
| 미사용 직접 의존성 정리 | cli-progress, fs-extra, lodash, p-retry 제거 |
| npm/pnpm lockfile 동기화 | 취약 패키지의 실제 의존 경로 제거 |

## 분석 동작과 리스크

파싱 실패, 계산된 import/require, 소스 2 MiB 제한 초과, Vue/Svelte/Astro/MDX/CoffeeScript 같은 미지원 형식이 있으면 분석을 partial로 표시하고 제거 후보를 억제한다. manifest만 있는 프로젝트도 제거 후보가 없다. Node 내장 모듈·주석 속 import를 외부 패키지 참조로 오인하지 않는다.

AST와 lexical pass는 서로 다른 단계지만 같은 TypeScript 엔진을 사용한다. 기존 depcheck의 모든 프레임워크 특수 처리를 동일하게 복제한 것은 아니다. JS 설정의 문자열·키, JSON/JSONC/YAML 설정, manifest scripts, ESLint plugin 이름과 loader 조합 등의 근거를 보존하되 정적 분석만으로 미사용을 증명하지는 않는다. 알 수 없는 항목을 자동 제거하지 않는 정책을 유지한다.

TypeScript 런타임 의존성 추가로 해당 배포 파일이 설치된다. Node 지원 범위를 유지하기 위해 5.9 patch 계열로 제한했다. 설치된 운영 의존성은 새 소비자 환경에서 29개 패키지였다.

## 최종 검증

| 항목 | 결과 |
|---|---|
| `npm audit --omit=dev --json` | 0건 |
| `npm audit --json` (개발 포함) | 0건 |
| 새 환경 `npm ci --ignore-scripts` | lockfile 기준 118개 설치 성공 |
| 새 환경 Node 22.16.0 | 테스트 33개 통과 |
| 새 환경 Node 18.14.0 | 테스트 33개 하위 항목 통과 (runner 요약: 파일 3개) |
| 린트 | 오류·경고 0개 |
| `npm run check:package` | 27개 배포 파일 검증 통과 |
| `npm run prepublishOnly` | 테스트·린트·패키지·audit 전체 통과, 종료 코드 0 |
| 실제 tarball 설치 후 `--help` / `--report --offline --json` | 성공, JSON schema 1 및 usage completed 확인 |
| tarball 소비자 환경 audit | 0건 |

추가한 5개 회귀 테스트는 모듈 문법별 탐지, 설정 전용/CLI 사용 근거, 해석 불가 시 제거 억제, 제외 경로·숨김 설정, workspace brace/negation·정규화 경로를 검증한다. 기존 28개 테스트도 유지했다.

이 기록은 점검 시점 결과다. Windows의 새 코드 실행과 원격 Actions 재실행은 아직 확인하지 않았다. 원시 결과와 tarball은 Git/npm에서 제외되는 `.packmate/security-remediation/`에 보관했다.

## Actions 재실행 시 주의

기존 실패 run을 다시 실행하면 이전 commit의 코드를 사용한다. 수정 commit을 반영한 후 package.json 버전과 일치하는 해당 commit의 tag로 release workflow를 실행해야 한다. npm 인증 권한과 레지스트리의 동일 버전 존재 여부는 별도 배포 조건이다.
