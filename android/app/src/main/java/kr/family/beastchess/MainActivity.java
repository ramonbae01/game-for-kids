package kr.family.beastchess;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.provider.Settings;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.OutputStream;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 비스트 챌린지 체스 - 안드로이드 앱
 * 앱 안에 들어있는 index.html을 WebView로 보여주고,
 * 온라인 대결은 AndroidNet 다리를 통해 Apps Script 서버와 통신해요.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";
    private WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private static final int REQ_FILE = 7001;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private static MainActivity current;
    private long lastUpdateCheck = 0;
    private File downloadedApk;
    private boolean installWhenAllowed = false;
    private volatile boolean updateBusy = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#9b8cff"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                return !"appassets.androidplatform.net".equals(u.getHost());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            /* 게임에서 "사진 찍기 / 앨범에서"를 누르면 카메라나 앨범을 열어요 */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                cameraUri = null;
                Intent camera = null;
                try {
                    File dir = new File(getCacheDir(), "camera");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
                    cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                    camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                    camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception e) {
                    camera = null;
                }
                Intent intent;
                if (params.isCaptureEnabled() && camera != null) {
                    intent = camera;                       // 📷 사진 찍기
                } else {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);   // 🖼️ 앨범에서
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("image/*");
                    intent = Intent.createChooser(pick, "사진 고르기");
                    if (camera != null) intent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                }
                try {
                    startActivityForResult(intent, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new NetBridge(), "AndroidNet");
        web.addJavascriptInterface(new UpdateBridge(), "AndroidUpdate");
        current = this;
        setContentView(web);
        hideSystemBars();

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    /** 화면 위아래 막대를 숨겨서 체스판을 크게 */
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};               // 앨범에서 고른 사진
            } else if (cameraUri != null) {
                result = new Uri[]{cameraUri};                    // 방금 찍은 사진
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // "다른 앱 설치 허용"을 켜고 돌아왔으면 바로 설치를 이어가요
        if (installWhenAllowed && canInstall()) {
            installWhenAllowed = false;
            startInstall();
        }
        // 3시간마다 새 버전 확인
        if (System.currentTimeMillis() - lastUpdateCheck > 3 * 3600 * 1000L) {
            web.postDelayed(this::checkUpdate, 4000);
        }
    }

    /* =========================================================
       🔄 자동 업데이트: version.json 확인 → APK 다운로드 → 설치
       ========================================================= */
    private static final String VERSION_URL =
            "https://github.com/ramonbae01/game-for-kids/releases/latest/download/version.json";

    private void updEvent(String json) {
        final String js = "window.__updEvt && window.__updEvt(" + json + ")";
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    static void notifyUpdateError(String msg) {
        MainActivity a = current;
        if (a != null) a.updEvent("{\"type\":\"error\",\"msg\":" + JSONObject.quote(msg == null ? "설치하지 못했어요" : msg) + "}");
    }

    private int myVersion() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void checkUpdate() {
        if (updateBusy || downloadedApk != null) return;
        lastUpdateCheck = System.currentTimeMillis();
        updateBusy = true;
        pool.execute(() -> {
            try {
                JSONObject v = new JSONObject(httpGetString(VERSION_URL));
                int code = v.getInt("versionCode");
                if (code > myVersion()) {
                    JSONObject ev = new JSONObject();
                    ev.put("type", "available");
                    ev.put("versionName", v.optString("versionName", "1." + code));
                    ev.put("notes", v.optString("notes", ""));
                    ev.put("current", "1." + myVersion());
                    updEvent(ev.toString());
                    downloadApk(v.getString("apk"), code);
                }
            } catch (Exception ignored) {
                // 인터넷이 없거나 아직 버전 정보가 없으면 조용히 넘어가요
            } finally {
                updateBusy = false;
            }
        });
    }

    private void downloadApk(String url, int code) {
        try {
            File dir = new File(getCacheDir(), "update");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "beast-chess-" + code + ".apk");
            if (!f.exists() || f.length() < 100000) {
                File tmp = new File(dir, "download.tmp");
                HttpURLConnection c = openFollow(url);
                long total = c.getContentLengthLong(), got = 0;
                int lastPct = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : -1;
                        if (pct != lastPct && pct % 5 == 0) {
                            lastPct = pct;
                            updEvent("{\"type\":\"progress\",\"pct\":" + pct + "}");
                        }
                    }
                }
                c.disconnect();
                if (!tmp.renameTo(f)) throw new Exception("rename");
            }
            // 받은 파일이 정말 새 버전인지 확인
            PackageInfo info = getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
            if (info == null || !getPackageName().equals(info.packageName)) throw new Exception("APK 파일이 이상해요");
            downloadedApk = f;
            updEvent("{\"type\":\"ready\",\"canInstall\":" + canInstall() + "}");
        } catch (Exception e) {
            updEvent("{\"type\":\"error\",\"msg\":" + JSONObject.quote("업데이트를 받지 못했어요: " + e.getMessage()) + "}");
        }
    }

    private void startInstall() {
        final File f = downloadedApk;
        if (f == null || !f.exists()) return;
        if (!canInstall()) {
            installWhenAllowed = true;
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                updEvent("{\"type\":\"error\",\"msg\":\"설정 화면을 열지 못했어요\"}");
            }
            return;
        }
        updEvent("{\"type\":\"installing\"}");
        pool.execute(() -> {
            try {
                PackageInstaller pi = getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params =
                        new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(getPackageName());
                if (Build.VERSION.SDK_INT >= 31) {
                    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                }
                int id = pi.createSession(params);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (OutputStream out = s.openWrite("base.apk", 0, f.length());
                         InputStream in = new FileInputStream(f)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        s.fsync(out);
                    }
                    Intent i = new Intent(this, InstallReceiver.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent pend = PendingIntent.getBroadcast(this, id, i, flags);
                    s.commit(pend.getIntentSender());
                }
            } catch (Exception e) {
                updEvent("{\"type\":\"error\",\"msg\":" + JSONObject.quote("설치하지 못했어요: " + e.getMessage()) + "}");
            }
        });
    }

    /** 게임 화면에서 부르는 업데이트 기능 */
    private class UpdateBridge {
        @JavascriptInterface public void check() { runOnUiThread(MainActivity.this::checkUpdate); }
        @JavascriptInterface public void install() { runOnUiThread(MainActivity.this::startInstall); }
        @JavascriptInterface public boolean canInstall() { return MainActivity.this.canInstall(); }
        @JavascriptInterface public String version() { return "1." + myVersion(); }
    }

    private static HttpURLConnection openFollow(String url) throws Exception {
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) break;
                url = new URL(new URL(url), loc).toString();
                continue;
            }
            if (code != 200) { c.disconnect(); throw new Exception("HTTP " + code); }
            return c;
        }
        throw new Exception("too many redirects");
    }

    private static String httpGetString(String url) throws Exception {
        HttpURLConnection c = openFollow(url);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = c.getInputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        c.disconnect();
        return out.toString(StandardCharsets.UTF_8.name());
    }

    /** 뒤로 가기: 게임 안의 창을 먼저 닫고, 처음 화면이면 앱을 내려요 */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__androidBack && window.__androidBack()) ? 'y' : 'n'", value -> {
            if (value == null || !value.contains("y")) moveTaskToBack(true);
        });
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** 온라인 대결: 자바스크립트 → Apps Script 서버 요청 다리 */
    private class NetBridge {
        @JavascriptInterface
        public void call(final String action, final String payloadJson, final String cbId) {
            pool.execute(() -> {
                String result;
                try {
                    result = request(action, payloadJson);
                } catch (Exception e) {
                    result = "{\"error\":\"인터넷 연결을 확인해 주세요\"}";
                }
                final String js = "window.__androidNetCb && window.__androidNetCb("
                        + JSONObject.quote(cbId) + "," + JSONObject.quote(result) + ")";
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
            });
        }

        @JavascriptInterface
        public boolean isApp() { return true; }
    }

    private static String request(String action, String payloadJson) throws Exception {
        if (payloadJson == null) payloadJson = "{}";
        String url = BuildConfig.GAS_URL;
        byte[] postBody = null;
        if (payloadJson.length() > 1500) {
            // 사진처럼 큰 데이터는 POST로 보내요
            postBody = ("{\"api\":" + JSONObject.quote(action) + ",\"p\":" + payloadJson + "}").getBytes(StandardCharsets.UTF_8);
        } else {
            url += "?api=" + URLEncoder.encode(action, "UTF-8")
                    + "&p=" + URLEncoder.encode(payloadJson, "UTF-8");
        }
        // Apps Script는 결과를 다른 주소로 한 번 넘겨주므로(리다이렉트) 직접 따라가요.
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Accept", "application/json");
            if (postBody != null && hop == 0) {
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                OutputStream os = c.getOutputStream();
                os.write(postBody);
                os.close();
            }
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) break;
                url = new URL(new URL(url), loc).toString();
                continue;
            }
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
            }
            c.disconnect();
            String body = out.toString(StandardCharsets.UTF_8.name());
            if (code != 200 || !body.trim().startsWith("{")) throw new Exception("bad response " + code);
            return body;
        }
        throw new Exception("too many redirects");
    }
}
