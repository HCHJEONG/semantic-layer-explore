# Enhans Semantic Workspace (한국어)

Enhans 회사를 위한 운영 인텔리전스 포트폴리오입니다. Semantic Map 기반 지식 그래프, 실시간 센서/기기 제어, Enhans AI를 활용한 자연어 질의, 승인 기반 자동화를 통합한 풀스택 애플리케이션입니다.

---

## 핵심 아키텍처

### 1. 도메인 중심 설계 (DDD)

```
domain/         → 타입 정의 (순수 TypeScript)
  ↓
runtime/        → 비즈니스 로직 (규칙 엔진, 시뮬레이터)
  ↓
adapters/       → 외부 시스템 연결 (시뮬레이터 어댑터)
  ↓
app/api/        → HTTP API 엔드포인트 (Next.js API Routes)
  ↓
components/     → UI 컴포넌트 (React + shadcn)
  ↓
app/            → 페이지 라우팅 (Next.js App Router)
```

**핵심 원칙:**
- **계층 분리** — 단방향 의존성 (상위 → 하위만 참조)
- **어댑터 패턴** — `adapters/physical-workspace-adapter.ts`가 시뮬레이터와 실제 하드웨어를 추상화
- **도메인 순수성** — `domain/`은 프레임워크 독립적 타입 정의

---

### 2. 폴더 구조

| 폴더 | 역할 | 핵심 파일 |
|---|---|---|
| **`app/`** | Next.js App Router — 페이지, 레이아웃, API 라우트 | `page.tsx`, `layout.tsx`, `globals.css`, `api/` |
| **`components/`** | UI 컴포넌트 — 재사용 가능한 React 컴포넌트 | `ai/ask-ai.tsx`, `dashboard/workspace-dashboard.tsx`, `ontology/`, `rules/rule-studio.tsx`, `shell/app-shell.tsx`, `ui/` (shadcn) |
| **`domain/`** | 도메인 타입 정의 — TypeScript 타입/인터페이스 | `ontology.ts`, `physical.ts`, `rule.ts` |
| **`runtime/`** | 런타임 엔진 — 시뮬레이터, 규칙 엔진, 데이터 유지보수 | `workspace-runtime.ts`, `rule-engine.ts`, `retention.ts` |
| **`adapters/`** | 어댑터 패턴 — 외부 시스템(시뮬레이터)과의 연결 | `physical-workspace-adapter.ts`, `simulator/simulator-adapter.ts` |
| **`db/`** | 데이터베이스 — Drizzle ORM 스키마와 연결 | `schema.ts`, `index.ts` |
| **`lib/`** | 유틸리티/라이브러리 — AI, 검증, 레이트리밋 등 | `gemini.ts`, `ai-http.ts`, `ai-tool-layer.ts`, `validation.ts`, `rate-limit.ts`, `internal-api.ts`, `ontology.ts`, `rules.ts`, `utils.ts` |
| **`drizzle/`** | SQL 마이그레이션 — `drizzle-kit generate`로 생성된 SQL 파일 | `outputFileTracingIncludes`로 standalone에 포함 |
| **`tests/`** | 통합 테스트 — Node.js 테스트 | `app.test.mjs` |

---

### 3. 주요 기능

#### A. Semantic Map

- **클래스(Classes)**, **프로퍼티(Properties)**, **인스턴스(Individuals)** 계층 구조 탐색
- React Flow 기반 그래프 시각화
- JSON Viewer로 원본 데이터 확인
- 의미론적 의미 자동 생성 ("X connects Y to Z")

#### B. Operations

- **4개 센서**: 온도, 조도, 거리, 버튼
- **4개 가상 기기**: LED, 서보, 부저, 릴레이
- **시뮬레이터 시나리오**: Normal, High temp, Dark room, Button press
- **이벤트 타임라인**: 감사 로그 (rule.matched, device.command 등)
- 2초마다 자동 새로고침

#### C. Ops Copilot (자연어 질의)

- **Enhans AI Function Calling** — 6개 도구를 사용한 단계적 데이터 수집
- **도구 목록**:
  1. `getOntology` — 온톨로지 스키마 조회
  2. `getCurrentState` — 전체 워크스페이스 상태
  3. `getSensors` — 센서 목록 및 최신 readings
  4. `getDevices` — 가상 기기 목록 및 상태
  5. `getRecentEvents` — 최근 50개 이벤트 타임라인
  6. `getRules` — 승인된 자동화 규칙
- **입력 측 통제** — 도구 정의를 시스템 프롬프트에 미리 제공 (LangChain Harness의 출력 측 제어와 대비)
- **읽기 전용** — 모든 도구가 GET 요청 (데이터 조회만)

#### D. Automation Studio (자동화 규칙 생성)

- **자연어 → 규칙 변환**: "온도가 30도를 넘으면 팬을 켜" → 구조화된 규칙 JSON
- **Enhans AI 6단계 Tool Calling**: Semantic Map → 센서 → 기기 → 규칙 확인
- **인간 in the loop**: AI 제안 → 사용자 검토/승인 → DB 저장
- **자동 실행**: 승인된 규칙은 `rule-engine.ts`가 실시간 평가 (Gemini 의존 없음)

---

### 4. 기술 스택

| 카테고리 | 기술 | 용도 |
|---|---|---|
| **프레임워크** | Next.js 16 (App Router) | 풀스택 웹 애플리케이션 |
| **번들러** | Turbopack / Vinext | 개발/빌드 최적화 |
| **UI 라이브러리** | shadcn/ui + Radix UI | 접근성 높은 UI 컴포넌트 |
| **스타일링** | Tailwind CSS v4 | 유틸리티 퍼스트 CSS |
| **AI/LLM** | Google Gemini 기반 Enhans AI | 자연어 처리, Function Calling |
| **데이터베이스** | SQLite + Drizzle ORM | 로컬 관계형 데이터베이스 |
| **검증** | Zod | 런타임 입력 검증 |
| **폰트** | Geist (Vercel) | 본문/코드 폰트 |
| **배포** | Docker + AWS EC2 | standalone 출력, SSH 터널링 배포 |

---

### 5. 자동 제어 vs Ops Copilot

| 구분 | 자동 제어 (Rule Engine) | Ops Copilot (Enhans AI) |
|---|---|---|
| **트리거** | 센서 이벤트 발생 | 사용자 질문 입력 |
| **처리 방식** | `rule-engine.ts` (로컬 평가) | Enhans AI Function Calling (6단계) |
| **속도** | ~10-50ms | ~2-5초 |
| **비용** | 무료 (로컬) | Gemini API 호출 비용 |
| **신뢰성** | 항상 동작 (오프라인 가능) | API 의존 |
| **용도** | "IF 온도 > 30 THEN 팬 ON" | "현재 운영 상태 요약해줘." |

**핵심:**
- **자동 제어**: 실시간, 로컬, 규칙 기반
- **Ops Copilot**: 분석, 설명, 자연어 기반

---

### 6. 배포 아키텍처

```
로컬 개발
  ↓
.gitignore (node_modules, .next, .vinext, data)
  ↓
Git 커밋
  ↓
.fordeploy/deploy.sh (배포 스크립트)
  ↓
Bastion 호스트 (43.202.136.180)
  ↓
Private 호스트 (172.31.76.194)
  ↓
Docker 빌드 (.fordeploy/ai-workspace-aws/Dockerfile)
  ↓
컨테이너 실행 (포트 3010:3000)
  - /app/data 볼륨 마운트 (SQLite DB)
  - gcp-key.json 마운트 (Enhans AI / Gemini 인증)
```

**특징:**
- **Standalone 출력** — `next.config.ts`의 `output: "standalone"`로 최소 의존성 번들
- **SSH 터널링** — Bastion → Private 호스트 2단계 배포
- **데이터 영속화** — Docker 볼륨으로 SQLite DB 유지

---

### 7. 설정 파일 역할

| 파일 | 참조 주체 | 역할 |
|---|---|---|
| **`next.config.ts`** | Next.js 프레임워크 | 빌드 설정 (standalone, better-sqlite3 외부화, X-Robots-Tag) |
| **`postcss.config.mjs`** | Turbopack (PostCSS 로더) | Tailwind v4 플러그인 등록 |
| **`eslint.config.mjs`** | ESLint | 코드 품질 검사 (Next.js + TypeScript 규칙) |
| **`drizzle.config.ts`** | Drizzle Kit CLI | SQL 마이그레이션 생성 (db/schema.ts → drizzle/*.sql) |
| **`components.json`** | shadcn CLI | 컴포넌트 설정 (스타일, 경로, 아이콘) |
| **`tsconfig.json`** | TypeScript + Turbopack + VS Code | 타입 검사, 경로 별칭 (@/components) |

---

### 8. 개발 워크플로우

```bash
# 개발 서버 (Turbopack)
npm run dev

# 빌드 (standalone 출력)
npm run build

# 테스트 (빌드 + Node.js 테스트)
npm run test

# 린트
npm run lint

# DB 마이그레이션 생성
npm run db:generate

# 배포
.fordeploy/deploy.sh
```

---

### 9. 핵심 설계 패턴

#### A. 입력 측 통제 (Input-Side Control)

- **LangChain Harness** (출력 측): LLM 출력 파싱 → 도구 호출 추출
- **이 레포** (입력 측): 도구 정의를 시스템 프롬프트에 미리 제공 → LLM이 구조화된 JSON 반환

**장점:**
- 안정성 (파싱 에러 없음)
- 단순성 (Agent 루프 불필요)
- 제어 가능성 (6개 도구로 제한)

#### B. 2단계 파이프라인 (규칙 생성 → 실행)

```
1단계: 자연어 → 규칙 JSON (Enhans AI, 6단계 tool calling)
  ↓ (사용자 검토/승인)
2단계: 규칙 JSON → 자동 실행 (rule-engine.ts, 로컬)
```

**장점:**
- 인간 in the loop (안전성)
- 실시간 성능 (로컬 규칙 엔진)
- 오프라인 동작 (Enhans AI API 의존 없음)

#### C. 도메인 계층 활용

- **온톨로지**가 단순 메타데이터가 아님
- 자연어 → 규칙 변환 시 **의미적 매핑**에 사용
- 예: "팬" → `getOntology()`로 "Fan" 클래스 확인 → `getDevices()`로 정확한 deviceId 매핑

---

### 10. 면접에서 강조할 점

1. **DDD + 어댑터 패턴** — 도메인/런타임/어댑터 계층 분리
2. **온톨로지 기반 AI** — 단순 API 호출이 아닌 의미론적 지식 그래프 활용
3. **2단계 파이프라인** — 생성(Enhans AI)과 실행(로컬) 분리로 안전성과 성능 확보
4. **입력 측 통제** — LangChain Harness와 대비되는 설계 선택
5. **실시간 규칙 엔진** — LLM 의존 없이 로컬에서 자동 제어

---

## 라이선스

MIT

## 제작

HCHJEONG
