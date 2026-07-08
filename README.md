# Void Log

친구 3~5명이 익명으로 방을 띄우고, 우주 공간처럼 비어 있는 화면에서 채팅하는 작은 하루 기록장입니다.

## 지금 들어간 것

- 방 생성: 이름, 설명, 분위기, 색상 선택
- 우주 메인 화면: 작은 방들이 떠다니는 UI
- 모바일 하단 방 목록과 빠른 조작 dock
- 익명 이름: 브라우저마다 자동 생성, 클릭해서 변경 가능
- 채팅방 입장 및 메시지 작성
- 채팅방 최소화 및 바로 복귀
- 방 만든 브라우저에서 방 이름, 설명, 분위기, 색상 수정
- 로컬 모드: 같은 브라우저의 여러 탭 사이에서 바로 동기화
- Supabase 모드: 친구들 기기끼리 실제 실시간 동기화 가능
- 방 24시간 만료 구조

## 로컬에서 보기

`localhost`는 내 컴퓨터에서만 열리는 테스트 주소입니다. 친구에게 보낼 주소가 아닙니다.

```bash
python3 -m http.server 5173
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:5173
```

## 친구들과 실제로 같이 쓰기

친구들에게 공유하려면 GitHub Pages, Vercel, Netlify 같은 공개 호스팅에 올려야 합니다. 이 프로젝트는 정적 파일만으로 돌아가므로 GitHub Pages로도 충분합니다.

GitHub Pages로 올리는 흐름:

1. GitHub에서 빈 repository를 만듭니다.
2. 이 폴더를 그 repository에 push합니다.
3. GitHub repository의 Settings > Pages로 갑니다.
4. Source를 `Deploy from a branch`로 설정합니다.
5. Branch는 `main`, folder는 `/root`를 선택합니다.
6. 발급된 `https://아이디.github.io/저장소이름/` 주소를 친구들에게 보냅니다.

Supabase 설정 흐름:

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql` 내용을 실행합니다. 기존 프로젝트도 같은 파일을 다시 실행하면 방 수정용 컬럼과 policy가 추가됩니다.
3. Project Settings > API Keys에서 `Publishable key`를 복사합니다.
4. Data API 화면 또는 프로젝트 ID를 기준으로 Project URL을 확인합니다.
5. `config.js`를 아래처럼 바꿉니다.

```js
window.VOID_LOG_CONFIG = {
  mode: "supabase",
  spaceId: "friends-void",
  accessCode: "친구들끼리-정한-코드",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_PUBLIC_KEY",
};
```

6. GitHub에 올리고 Vercel 또는 GitHub Pages로 배포합니다.

주의: `accessCode`는 친구끼리 쓰는 가벼운 입장문입니다. 공개 웹에서 완전한 보안이 필요하면 서버 함수나 Supabase Edge Function으로 검증해야 합니다. 그리고 Supabase `secret` key나 `service_role` key는 절대 브라우저 코드에 넣으면 안 됩니다.

## 다음 개발 후보

- 방 생성 쿨다운
- 신고/삭제용 관리자 코드
- 오래된 메시지 자동 청소
- 방 링크 공유
- 방을 열 때 확대되는 애니메이션 강화
- 방장 보호를 서버 함수 기반으로 강화
