/**
 * 비스트 챌린지 체스 - Google Apps Script 웹앱
 * 이 프로젝트에 HTML 파일을 "index" 라는 이름으로 추가하고 index.html 내용을 붙여넣으세요.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('비스트 챌린지 체스')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
