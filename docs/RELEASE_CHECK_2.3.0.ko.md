# Packmate 2.3.0 배포 전 최종 점검

> 이 문서는 교체 전의 배포 차단 상태를 기록합니다. 이후 취약 의존성을 제거하고 전체 검증을 통과했으며 최신 결과는 [audit 실패 해결](SECURITY_REMEDIATION.ko.md)을 참고하세요.

점검일: 2026-10-15. **기능·설치·패키징 검증 통과. 보안 검사 미통과로 npm 배포 보류.** npm publish, Git tag 생성·push는 실행하지 않았다.

## 배포 준비 변경

- npm 레지스트리에서 2.2.0이 이미 배포되어 있음을 확인했다. 사용자 선택에 따라 package.json과 npm lockfile 루트 버전을 2.3.0으로 맞췄다.
- `files` 허용 목록으로 bin/src/설정 예시/변경 이력만 배포하며, README·LICENSE·package.json은 npm 기본 포함 규칙을 따른다. 실제 tarball은 26개 파일이다. 로컬 설정, 체크포인트, example, 테스트, 개발 스크립트는 제외된다.
- `check:package`로 lockfile 일치, 필수 파일, 상대 import 대상, bin shebang, 예상하지 않은 파일 포함 여부를 검사한다.
- `prepublishOnly`에서 테스트 → 린트 → 패키지 검사 → high 이상 운영 의존성 audit를 수행한다. 실제 실행에서 앞의 세 검사는 통과하고 audit 때문에 종료 코드 1이 반환되는 것을 확인했다.
- 릴리스 workflow는 Node 22 및 `npm ci`를 사용하고, tag와 package.json의 버전이 다르면 중단한다. 테스트·패키지 검사·보안 검사 이후에만 publish 단계로 진행한다. 원격 workflow는 실행하지 않았다.
- 소스가 없는 manifest 전용 입력에서 85개 패키지를 high confidence 미사용으로 표시하던 문제를 수정했다. 이제 제거 후보는 0개이며 usage 상태는 partial/manifest-only다. 회귀 테스트를 추가했다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 새 디렉터리 `npm ci --ignore-scripts` | lockfile 기준 261개 설치 성공 |
| 새 설치 환경 Node 22.16.0 테스트 | 28개 통과 |
| 새 설치 환경 Node 18.14.0 테스트 | 동일 28개 하위 테스트 통과 (구버전 runner 요약은 테스트 파일 2개) |
| 린트 | 오류·경고 0개 |
| `npm run check:package` | 2.3.0, 26개 파일 검증 통과 |
| tarball을 별도 환경에 실제 설치 | 성공, 설치된 bin의 `--help` 실행 성공 |
| `git diff --check` | 통과 |
| 운영 의존성 audit | **high 9, moderate 3, total 12** |
| `npm run prepublishOnly` | 보안 검사 단계에서 의도대로 차단, 종료 코드 1 |

스크립트 부수 효과 없이 라이브러리 동작을 점검하기 위해 임시 환경의 의존성 설치 시 `--ignore-scripts`를 사용했다. Windows 실행 및 원격 Actions 검증 결과를 의미하지 않는다.

## 제공된 예제의 실제 통합 테스트

전달받은 manifest(운영 82개·개발 22개)의 임시 복사본으로 실행했다. 원본을 수정하거나 예제의 전체 major 업데이트를 적용하지 않았다.

1. 일반 npm 설치는 기존 `date-fns@4`와 `react-day-picker@8.10.1`의 peer 충돌로 ERESOLVE를 반환했다. 라이브러리 결함과 예제 자체의 설치 제약을 구분했다.
2. 복사본에서 `--legacy-peer-deps --ignore-scripts`로 1,033개 패키지를 실제 설치했다.
3. 배포 형태로 설치한 Packmate로 registry 조회·npm audit·계획 생성 실행: 업데이트 30개, unknown 0, missing 0, 제거 후보 0. 소스가 없어 사용 분석은 partial이다.
4. 보안 보고서는 영향 패키지별 권고 98개(직접 73·전이 25)를 보존했다. 동일 권고가 여러 영향 패키지에 집계되므로 npm audit의 고유 취약 패키지 수와 직접 비교하면 안 된다. 전이 권고의 자동 수정은 blocked로 남겼다.
5. 생성된 계획에서 `cmdk 1.0.0 → 1.1.1` 하나만 선택해 실제 적용했다. 기본 npm 환경에서는 예제의 peer 충돌로 실패하고, failed checkpoint를 생성하며 manifest/lockfile 변경 없이 중단함을 확인했다.
6. 실패 체크포인트를 CLI로 복구한 후, 예제 설치와 동일한 legacy peer 설정으로 재실행해 성공했다. manifest와 실제 node_modules 모두 새 버전을 확인했다.
7. 성공 체크포인트를 CLI로 복구했다. manifest와 lockfile이 원본 스냅샷과 byte 단위로 같음을 확인했고, 재설치 후 node_modules의 cmdk도 1.0.0으로 복구했다.

예제 앱의 소스가 제공되지 않아 Next build·앱 UI 동작 검증은 수행할 수 없었다. 이 결과는 Packmate의 실제 설치·보고서·실행·실패·복구 경로에 대한 검증이다.

## 남은 배포 차단 사유

처음 저장소 audit는 high 16·moderate 3이었다. `npm audit fix --package-lock-only --ignore-scripts`로 허용 범위 내에서 수정한 뒤 high 9·moderate 3이 남았다. 주요 경로는 다음과 같다.

- `globby → fast-glob → micromatch → braces`: 패턴 처리의 스택 소진/서비스 거부 권고가 전파된다.
- `depcheck → findup-sync → micromatch` 및 `depcheck → js-yaml@3 → argparse → sprintf-js`: 취약성이 전파된다.
- `precinct → detective-typescript → @typescript-eslint/typescript-estree → globby`: 같은 취약 경로가 포함된다.

이 수치는 영향 패키지 노드 집계이며 서로 독립된 12개 공격 방법을 뜻하지 않는다. 새로 설치한 배포 패키지에서도 같은 경로가 나타나므로 오래된 개발 환경만의 문제가 아니다. npm의 force 제안에는 depcheck/globby의 과거 버전으로 이동하거나 precinct major 변경이 포함되어 있어, 검증 없이 적용하지 않았다.

**배포 전 필요한 작업:** 위 경로의 패치 적용 가능성을 확인하거나 취약 의존성을 대체하고, Node 18/22 호환성과 사용 분석 정확성을 다시 검증한 뒤 audit gate를 통과해야 한다. 현재 보호 장치를 우회해 배포하지 않는 것이 권장된다. 버전 준비와 기능 검증 완료를 보안 검사 통과로 간주하면 안 된다.

## 증빙

원시 로그·audit JSON·예제 보고서·tarball은 로컬 `.packmate/release-check-2.3.0/`에 보관했다. 이 디렉터리는 Git과 npm 배포 대상에서 제외된다. `summary.json`에 핵심 수치를 기록했다. 실제 사용자 계정의 publish 권한과 배포 후 registry 상태는 점검하지 않았다.
