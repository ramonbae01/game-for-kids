# 📱 비스트 체스 안드로이드 앱

`beast-chess/index.html` 게임을 그대로 담은 안드로이드 앱입니다.

- 컴퓨터 대결 · 둘이서 하기는 인터넷 없이도 돼요 (글꼴만 기본 글꼴로 바뀜)
- 온라인 대결은 Apps Script 서버를 써서, 웹 버전 사용자와도 함께 할 수 있어요
- 뒤로 가기 버튼: 열린 창 닫기 → 게임 메뉴 → 처음 화면이면 앱 내리기

## APK 만들기
GitHub에 올리면 **Actions → 안드로이드 앱 만들기**가 자동으로 APK를 만들고
**Releases** 페이지에 `beast-chess.apk`를 올려요. 휴대폰에서 그 파일을 받아 설치하세요.

직접 빌드하려면 (Android SDK 필요):
```bash
gradle -p android assembleRelease
```

## 서명 키
`app/family.keystore`(비밀번호 beastchess)는 가족용 설치를 위한 기본 키예요. 저장소가 공개라 누구나 볼 수 있으니,
Play 스토어에 올리거나 더 안전하게 쓰려면 저장소 Settings → Secrets에
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`를 넣으세요. (키를 바꾸면 앱을 지웠다 다시 설치해야 해요)
