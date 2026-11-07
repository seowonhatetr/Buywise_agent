# SolomonPrice India – 제품명을 치면 가장 싼 쇼핑몰로 연결 (다나와 방식)

## 동작
1. 사용자가 제품명을 입력한다. 예: `samsungs23`, `Samsung Galaxy S25 256GB`, `cetaphil cleanser`
2. AI(Gemini 무료)가 오타와 띄어쓰기를 고쳐 검색어로 바꾼다. AI가 실패하면 입력한 글자 그대로 검색한다.
3. 서버가 Google Shopping(인도)을 SerpApi로 조회한다.
4. **정확한 모델만** 보여준다. 검색어 뒤에 사용자가 쓰지 않은 변형 단어(FE, Plus, Pro, Max, Ultra, Edge, Lite, Mini, 모델 끝 글자 e/r/s 등)가 붙은 제품은 제외한다. 예: `S25`는 S25 FE, S25+, S25 Ultra를 빼고, `iPhone 16`은 16e, 16 Plus, 16 Pro를 빼고, `OnePlus 13`은 13R을 뺀다. 휴대폰, 노트북, TV는 정확한 모델이 없으면 비슷한 제품을 보여주지 않고 "결과 없음"으로 안내한다.
   케이스, 충전기, 스킨/스티커 같은 액세서리를 걸러내고, **너무 싼 의심스러운 가격**도 제외한다. 제품 종류(AI가 분류, 실패하면 단어로 추측)에 따라 최소 가격이 있다(휴대폰 ₹4,000, 노트북 ₹12,000, TV ₹4,000, 스킨케어 ₹30). 휴대폰은 용량(GB)이나 5G가 제목에 없는 목록을 빼고, 새 제품 중 가장 비싼 가격의 40%보다 싼 것도 뺀다. 결과는 **새 제품**과 **중고/리퍼비시**로 나누어, 각각 판매처별 최저가를 싼 순서로 보여준다. (구분은 Google의 중고 표시나 제목의 Refurbished, Renewed, Used 같은 단어로 한다.)
5. "Buy at lowest price" 버튼이 **판매처 사이트의 상품 페이지**로 바로 연결된다. Google 쇼핑의 목록 링크는 대부분 Google을 거치기 때문에, 가장 싼 새 제품의 "immersive product" 페이지를 한 번 더 조회해 각 판매처의 자체 링크를 찾고, 판매처 이름으로 맞춰 바꾼다. (SerpApi 크레딧을 검색당 1개 더 쓴다.)
   - 판매처 링크를 못 찾은 줄에는 `via Google`이 표시되고 Google 상품 페이지로 연결된다. 그 페이지에서 `Visit site`를 누르면 판매처로 간다.
   - 중고/리퍼비시는 크레딧을 아끼려고 판매처 링크를 따로 찾지 않는다. 중고 줄은 모두 `via Google`이다.
- 예시 검색어(`scripts/featured.json`)는 GitHub Actions가 매주 월요일에 미리 조회해 `public/prices.json`에 저장한다. 서버는 AI나 SerpApi를 부르기 전에 이 파일부터 확인하므로, 그 검색은 즉시 나오고 크레딧을 쓰지 않는다.
- 결과 먼저 보여주기: 새 검색은 가격 목록을 먼저 보여주고(SerpApi 1회), 판매처 직접 링크는 두 번째 요청(`links:true`)으로 가져와 화면에서 바꿔 끼운다. 그동안 버튼은 `via Google` 링크로 이미 눌러도 된다. 서버가 재시작돼 첫 검색 기록이 없으면 두 번째 요청은 `expired`로 끝나고 Google 링크가 그대로 남는다.
- 속도와 크레딧 절약: 같은 검색어는 서버에서 24시간 캐시하고, 브라우저에서도 한 번 방문 안에서는 다시 조회하지 않는다. 입력이 이미 깔끔하면(영문/숫자와 띄어쓰기) AI 오타 교정을 건너뛴다. 같은 검색이 동시에 들어오면 한 번만 조회한다.

## 환경 변수 (Render → Environment)
| 이름 | 값 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio 키 (오타 교정용) | 권장 |
| `SERPAPI_KEY` | SerpApi 키 (**이제 Render에도 필요**) | 필수 |
| `MODEL` | 예: `gemini-2.5-flash-lite`. 지정하면 서버가 시작할 때 모델 목록을 조회하지 않아 첫 검색이 빨라진다 | 권장 |
| `DAILY_LIMIT` | 하루에 쓸 SerpApi 크레딧 상한 (기본 24). 새 검색 1번은 1~2크레딧(검색 1 + 새 제품 판매처 링크 1)이다 | 선택 |
| `USED_SEARCH` | `1`로 설정하면 중고 결과가 없을 때 "refurbished 제품명"으로 한 번 더 검색 (검색 횟수가 늘어난다) | 선택 |
`SERPAPI_KEY`는 GitHub Secrets에도 그대로 둔다 (예시 검색어 갱신용).

## 한도 (무료라서)
- SerpApi 무료 플랜은 월 250크레딧이다. 새 검색 1번은 1~2크레딧을 쓴다. 예시 검색어 갱신은 검색어당 2크레딧이라 7개 × 주 4~5회 ≈ 월 60크레딧이다. 같은 검색은 24시간 캐시되지만, **Render 무료 서버는 잠들면 캐시가 사라진다.**
- 하루 쓸 크레딧을 24로 막아 둔다(`DAILY_LIMIT`, 새 검색 약 12~24회). 넘으면 "오늘 한도 소진" 안내가 나오고 예시 검색어는 계속 된다. 크레딧이 모자라면 판매처 링크 조회만 건너뛰고(`via Google`로 표시) 검색 자체는 계속 된다. 사용자 테스트 날에는 이 값을 올리거나, 테스트 참가자에게 예시 검색어와 몇 개의 검색만 쓰도록 안내한다.
- 월 한도를 쓰면 SerpApi가 거절하고, 화면은 "검색을 쓸 수 없다"고 안내한다.
- Gemini 무료 등급은 요청 제한이 있고 입력을 Google이 제품 개선에 쓸 수 있다. 화면 하단에 고지가 있다.

## 알려진 한계 (리포트 A에 그대로 적을 것)
- 가격은 Google Shopping 결과 시점의 값이고 쇼핑몰 재고와 직접 연결돼 있지 않다. 같은 제품이어도 용량, 색상별 가격이 섞일 수 있어 제목을 함께 보여 준다.
- 판매처 링크는 일반 상품 링크이고 제휴(수수료) 링크가 아니다. 수익을 내려면 제휴 프로그램 링크로 바꿔야 한다. 판매처 자체 링크는 SerpApi의 immersive product 응답에 의존하므로 형식이 다르면 `via Google`로 대체된다.
- 제품 카테고리에 제한은 없지만, 제품명이 모호하면 가장 가까운 결과를 "closest matches"로 보여 준다.
- 카드 혜택가, 할부, 판매자 평점은 데이터가 없어서 넣지 않았다.
- 이메일/WhatsApp 가격 알림은 없다.

## 업데이트 방법 (이미 올린 저장소에)
1. zip을 풀고 내용물을 GitHub 저장소 → Add file → Upload files로 올려 같은 이름의 파일을 덮어쓴다. (`api`, `public`, `scripts`, `server.js`, `README.md`)
2. 이전 파일 `api/intent.js`, `api/prices.js`, `api/_catalog.js`는 더 이상 쓰이지 않는다. 남아 있어도 문제없다.
3. Render Environment에 `SERPAPI_KEY` 추가 → 저장하면 자동 재배포
4. GitHub → Actions → Refresh prices → Run workflow (예시 검색어 가격을 새로 채움)

## 사용 로그를 Google Sheet로 받기 (선택)
Apps Script에 아래를 붙여 웹 앱으로 배포(액세스 `모든 사용자`)하고, 주소를 `EVENT_WEBHOOK_URL`에 넣는다.
```js
function doPost(e){const r=JSON.parse(e.postData.contents);
SpreadsheetApp.getActiveSheet().appendRow([r.t,r.sid,r.type,r.data]);
return ContentService.createTextOutput('ok')}
```
