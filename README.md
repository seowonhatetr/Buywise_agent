# BuyWise India – 0원 배포 가이드 (GitHub + Vercel + Gemini 무료 + GitHub Actions)

## 구성과 비용
| 부분 | 서비스 | 비용 |
|---|---|---|
| 코드 보관 | GitHub | 무료 |
| 웹 호스팅 | Vercel (Hobby, `xxx.vercel.app` 주소) 또는 Render 무료 Web Service | 무료 (비상업적 사용 기준이라 수업 과제에는 적합, 사업화하면 약관 확인) |
| AI 대화 | Google Gemini API 무료 등급 (`api/intent.js`) | 무료, 요청 제한 있음. **무료 등급 입력은 Google이 제품 개선에 쓸 수 있다** |
| 가격 | GitHub Actions가 4일마다 Google Shopping을 조회해 `public/prices.json` 갱신 (SerpApi 무료 플랜) | 무료, 월 조회 한도 있음 |
| 사용 로그 | Google Sheet (선택) | 무료 |
| 도메인 | 필요 없음 (vercel.app 주소로 충분). 사고 싶으면 Vercel에서 연결 가능 | 도메인 값만 |

## 배포 순서
1. zip을 풀고, 안의 내용(`api`, `public`, `scripts`, `.github`, `package.json`, `vercel.json`, `README.md`, `.env.example`)을 GitHub 새 저장소(Private 권장)에 업로드한다. 폴더를 통째로 올리지 말고 **내용물**을 올려야 하고, 숨김 폴더 `.github`도 포함해야 한다. (드래그가 안 되면 Add file → Create new file에서 `.github/workflows/refresh-prices.yml` 이름으로 내용을 붙여넣는다.)
2. aistudio.google.com에서 Google 계정으로 로그인 → API 키 생성 (결제 정보 없이 만들 수 있다).
3. Vercel → Add New → Project → 저장소 Import → Framework Preset `Other` → Environment Variables에 `GEMINI_API_KEY` 입력 → Deploy
4. serpapi.com 가입(무료 플랜) → API 키 복사 → GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 `SERPAPI_KEY`
5. GitHub 저장소 → Actions 탭 → `Refresh prices` → Run workflow (처음 한 번 직접 실행). 1~2분 뒤 `public/prices.json`이 채워지고 Vercel이 자동 재배포한다. 이후에는 4일마다 자동 갱신된다.
6. 시크릿 창에서 배포 주소를 열어 확인한다: "Best phone under ₹40K for camera + battery" 입력 → 질문을 되묻거나 결과 위에 "Read by AI" 태그가 보이면 AI가 작동하는 것이고, 결과 카드에는 가격, 사진, 확인 시각이 나와야 한다.

## Render에 배포하려면 (Vercel 대신)
Render의 **Static Site**는 `api/` 폴더의 서버 함수를 실행하지 못한다. 반드시 **Web Service**로 만들어야 하고, 이 저장소에는 이를 위한 `server.js`가 들어 있다.
1. Render → New + → **Web Service** → GitHub 저장소 선택
2. Runtime `Node`, Build Command `npm install`, Start Command `node server.js`, Instance Type `Free`
3. Environment → `GEMINI_API_KEY` 추가 → Create/Deploy
4. 가격 파일은 GitHub Actions가 `public/prices.json`을 저장소에 커밋하면, Render가 자동 배포(Auto-Deploy)로 반영한다. Auto-Deploy가 켜져 있는지 확인한다.
5. 무료 Web Service는 한동안 접속이 없으면 잠들고, 다시 열 때 첫 로딩이 1분 가까이 걸릴 수 있다. 데모 영상과 테스트 직전에 주소를 한 번 열어 깨워 둔다.
6. 이미 다른 프로젝트가 올라간 저장소라면 덮어쓰기 전에 백업하거나 새 저장소를 만든다.

## 한도 (무료라서 생기는 제약)
- 가격은 실시간이 아니라 **4일마다 갱신되는 스냅샷**이다. 화면에는 확인 날짜와 시각이 표시된다. SerpApi 무료 플랜은 월 250회로 알려져 있고(가입 화면에서 확인), 상품 11개를 4일마다 조회하면 월 약 90회를 쓴다. 수동 실행을 너무 자주 하면 한도를 넘는다.
- Gemini 무료 등급은 요청 제한이 있고 AI Studio 콘솔에서 확인할 수 있다. 한도를 넘으면 429가 나오고, 화면은 자동으로 규칙 기반 되묻기로 바뀐다.
- 화면에 "검색어가 Gemini 무료 등급으로 처리되고 Google이 개선에 쓸 수 있다"는 고지가 있다. 테스트 참가자에게도 개인정보를 입력하지 말라고 알린다.
- 링크는 Google Shopping 결과이고 제휴(수수료) 링크가 아니다.
- 성능 점수(카메라, 배터리, 피부 순함 등)는 팀이 매긴 점수이지 실측이 아니다.
- 직접 가격을 넣고 싶으면 `public/prices.json`을 같은 구조로 손으로 고쳐도 된다.
- 트레이드오프 설명은 템플릿이고, 이메일/WhatsApp 알림 발송은 없다.

## 사용 로그를 Google Sheet로 받기 (선택)
1. 새 Google Sheet → 확장 프로그램 → Apps Script:
   ```js
   function doPost(e){const r=JSON.parse(e.postData.contents);
   SpreadsheetApp.getActiveSheet().appendRow([r.t,r.sid,r.type,r.data]);
   return ContentService.createTextOutput('ok')}
   ```
2. 배포 → 새 배포 → 웹 앱, 액세스 `모든 사용자` → URL을 Vercel 환경 변수 `EVENT_WEBHOOK_URL`에 넣고 Redeploy

## 문제 해결
- 404: `api`와 `public`이 저장소 맨 위에 있는지 확인
- "Prices have not been loaded yet": 5단계(Run workflow)를 했는지, Actions 탭의 실행이 초록색인지, `SERPAPI_KEY` 이름 확인
- AI가 안 되고 규칙 기반 질문만 나온다: `GEMINI_API_KEY` 확인 후 Redeploy, Vercel Logs에서 `gemini 4xx` 확인
- Actions가 실패하며 권한 오류: Settings → Actions → General → Workflow permissions → Read and write permissions
