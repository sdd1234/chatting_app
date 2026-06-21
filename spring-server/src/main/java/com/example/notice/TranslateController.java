package com.example.notice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 번역 프록시. 1주차 "번역 기능" 의 Spring 포팅.
 *
 *   POST /translate
 *     Authorization: Bearer <JWT>
 *     body: { "text": "안녕", "target": "en", "source": "auto"(선택) }
 *     → { "translated": "Hello", "detected": "ko", "cached": false }
 *
 * 백엔드: 구글 비공식 엔드포인트 (translate.googleapis.com/translate_a/single, client=gtx).
 *   기존 websocket-client/serve.js 의 translateGoogle() 을 그대로 옮김 — 키/가입 불필요(데모용).
 *   응답 형태: arr[0] = [[번역세그먼트, 원문세그먼트, ...], ...], arr[2] = 감지된 source 언어.
 */
@RestController
public class TranslateController {

    private static final Logger log = LoggerFactory.getLogger(TranslateController.class);

    private final JwtUtil jwt;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    // 메모리 캐시 (source::target::text → translated). 서버 재시작 시 소실.
    private final Map<String, String[]> cache = new ConcurrentHashMap<>();

    public TranslateController(JwtUtil jwt) {
        this.jwt = jwt;
    }

    @PostMapping("/translate")
    public Map<String, Object> translate(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        requireUser(auth);

        String text = str(body.get("text"));
        String target = str(body.get("target"));
        String source = body.get("source") == null ? "auto" : str(body.get("source"));
        log.debug("[DBG:trans:1] 번역 요청 text='{}' target={} source={}", text, target, source);
        if (text.isEmpty() || target.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fields 'text' and 'target' required");
        }

        String key = source + "::" + target + "::" + text;
        String[] hit = cache.get(key);
        if (hit != null) {
            log.debug("[DBG:trans:2] 캐시 히트 key={} → 즉시 반환", key);
            return result(hit[0], hit[1], true);
        }
        log.debug("[DBG:trans:2] 캐시 미스 → Google 비공식 API 호출 시작");

        try {
            String url = "https://translate.googleapis.com/translate_a/single?client=gtx"
                    + "&sl=" + enc(source) + "&tl=" + enc(target) + "&dt=t&q=" + enc(text);
            log.debug("[DBG:trans:3] HTTP GET → translate.googleapis.com sl={} tl={}", source, target);
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", "Mozilla/5.0")
                    .timeout(Duration.ofSeconds(8))
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "google translate returned " + resp.statusCode());
            }

            JsonNode root = json.readTree(resp.body());
            StringBuilder sb = new StringBuilder();
            for (JsonNode seg : root.get(0)) {
                JsonNode t = seg.get(0);
                if (t != null && !t.isNull()) sb.append(t.asText());
            }
            String translated = sb.toString();
            String detected = (root.size() > 2 && !root.get(2).isNull()) ? root.get(2).asText() : source;
            log.debug("[DBG:trans:4] Google 응답 translated='{}' detected={}", translated, detected);

            cache.put(key, new String[]{ translated, detected });
            log.debug("[DBG:trans:5] 메모리 캐시 저장 완료 → 응답 반환");
            return result(translated, detected, false);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("translate failed", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "translate failed: " + e.getMessage());
        }
    }

    private Map<String, Object> result(String translated, String detected, boolean cached) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("translated", translated);
        out.put("detected", detected);
        out.put("cached", cached);
        return out;
    }

    private void requireUser(String authHeader) {
        String token = AuthController.extractBearer(authHeader);
        try {
            jwt.verify(token);
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid or expired token: " + e.getMessage());
        }
    }

    private static String str(Object o) { return o == null ? "" : o.toString().trim(); }
    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }
}
