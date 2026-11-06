# 🛒 BuyWise - Smart Price Comparison Agent

BuyWise는 외부 API의 일일 요청 한도(Daily Rate Limit) 제한을 극복하고, 빠르고 안정적인 최저가 검색 경험을 제공하기 위해 **자체 DB 캐싱 및 수집 기반 아키텍처**로 설계된 스마트 상품 최저가 비교 서비스입니다.

---

## 📌 주요 특징 (Key Features)

- **AI & API 호출 최소화**: 동일/유사 검색어 요청 시 외부 API를 재호출하지 않고, 저장된 DB 및 캐시 데이터를 즉시 반환합니다.
- **빠른 응답 속도 (Low Latency)**: 인메모리 캐싱(Cache-First) 및 검색 인덱스를 통해 0.1초 내외의 빠른 응답 시간을 보장합니다.
- **안정적인 서비스 제공**: 외부 API의 일일 제공 할당량(Daily Limit) 초과로 인한 서비스 중단을 차단합니다.
- **오타 교정 및 키워드 정규화**: 소문자 변환, 공백 제거, 띄어쓰기 정규화를 적용해 캐시 적중률(Hit Rate)을 극대화합니다.

---

## 🏗️ 시스템 아키텍처 (System Architecture)

```mermaid
flowchart TD
    A[사용자] -->|제품명 입력| B[프론트엔드 UI]
    B -->|검색 요청| C[Node.js 서버]
    C -->|Cache Hit| D[캐시 DB (JSON)]
    C -->|Cache Miss| E[외부 API - SerpApi]
    E -->|데이터 가공| D
    D -->|최저가 목록| B
    C -.->|실시간 로그| F[Google Sheets Webhook]
    C -.->|상태 모니터링| G[헬스 체크 엔드포인트]
```

### Cache-First Workflow
1. **캐시 확인**: 서버는 `public/cache.json`을 먼저 확인합니다.
2. **캐시 적중**: 24시간 이내 데이터가 있으면 즉시 반환 (0.1초).
3. **캐시 미스**: 외부 API 호출 → 데이터 정규화 → 캐시 저장.
4. **일일 한도 관리**: SerpApi 할당량 초과 시 `429 Too Many Requests`로 차단.

### 데이터 파이프라인
- **검색어 정규화**: `normalizeQuery()` 함수로 소문자, 공백 제거
- **정확한 모델 필터링**: `filterExactModels()`로 FE/Plus/Pro 변형 제외
- **최소 가격 검증**: 휴대폰 ₹4,000, 노트북 ₹12,000 이상만 표시
- **링크 생성**: SerpApi `google_product` 엔진을 통한 판매처 직접 링크

---

## 🚀 배포 방법 (Deployment)

### 환경 변수 (Environment Variables)
| 변수명 | 필수 | 설명 |
|--------|------|------|
| `GEMINI_API_KEY` | 권장 | Google AI Studio 키 (오타 교정용) |
| `SERPAPI_KEY` | 필수 | SerpApi 키 (상품 검색용) |
| `DAILY_LIMIT` | 선택 | 일일 SerpApi 크레딧 한도 (기본 12) |
| `EVENT_WEBHOOK_URL` | 선택 | Google Sheets Webhook URL (로그 수집용) |

### 실행 방법
```bash
# 로컬 실행
npm install
npm start

# Docker 배포 (준비 중)
# docker build -t buywise .
# docker run -p 3000:3000 buywise
```

---

## 📊 API 엔드포인트

- `POST /api/search` - 상품 검색
- `GET /api/featured` - 인기 검색어 목록
- `GET /api/health` - 서비스 상태 확인

## 📋 라이선스

MIT License

---

*문서 버전: 2.1.0 | 최종 업데이트: 2026-11-07*