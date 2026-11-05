# 삼중일기 작업 규칙

- 사이트: https://seaside08.github.io/samjiwon/ (GitHub Pages, `main` 브랜치 그대로 배포)
- **수정은 `draft` 브랜치에서** 한다. 고칠 때마다 `draft`에 커밋·푸시해 둔다 (Pages 배포 안 됨, 작업 보관용).
- 확인은 가짜 데이터 화면(`?demo`)을 로컬에서 띄워 스크린샷으로 보여 주고 확정받는다.
- **사용자가 "배포해줘"라고 할 때만** `draft`를 `main`에 합쳐 한 번에 푸시한다.
  - 푸시 전 `index.html`의 `?v=` 숫자를 올린다 (캐시 무효화 · 동기화 버튼의 새 버전 감지).
  - 배포 완료(GitHub Actions `pages build and deployment` 성공)를 확인한 뒤 알린다.
- 위젯(`widget/*.js`)과 구글 스크립트(`google/apps-script.js`)는 사용자가 직접 복사해 붙여 넣는다 — 배포 때 함께 안내.
- 사용자에게는 존댓말.
