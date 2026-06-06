package com.example.notice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 사용자 디렉토리 (친구 목록).
 *
 *   GET /users                Authorization: Bearer <JWT>   (admin 아님 — 일반 user 도 허용)
 *     → { ok, domain, users: ["jihoon", "emma", ...] }
 *
 * 왜 별도:
 *   기존 /admin/mongoose/users 는 admin role 전용(requireAdmin)이라 일반 user(jihoon/emma)는
 *   친구 목록을 못 봤다. 채팅 앱에서 친구 목록은 모든 사용자에게 필요하므로,
 *   JWT 만 검증하고(role 무관) Spring 이 admin 자격으로 mongoose listUsers 를 대신 호출한다.
 *   (admin:secret 자격은 Spring 이 들고 있고 클라엔 노출 안 됨 — 프록시 패턴 유지)
 */
@RestController
public class UserDirectoryController {

    private static final Logger log = LoggerFactory.getLogger(UserDirectoryController.class);

    private final JwtUtil jwt;
    private final RestClient client;
    private final String domain;
    private final ObjectMapper json = new ObjectMapper();

    public UserDirectoryController(
            JwtUtil jwt,
            @Value("${mongooseim.graphql.url}") String url,
            @Value("${mongooseim.graphql.user}") String user,
            @Value("${mongooseim.graphql.pass}") String pass,
            @Value("${mongooseim.domain}") String domain) {
        this.jwt = jwt;
        this.domain = domain;
        String basic = "Basic " + Base64.getEncoder().encodeToString(
            (user + ":" + pass).getBytes(StandardCharsets.UTF_8));
        // Cowboy 호환 — SimpleClientHttpRequestFactory(HttpURLConnection) 강제
        this.client = RestClient.builder()
            .baseUrl(url)
            .defaultHeader("Authorization", basic)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .requestFactory(new SimpleClientHttpRequestFactory())
            .build();
    }

    @GetMapping("/users")
    public Map<String, Object> users(
            @RequestHeader(value = "Authorization", required = false) String auth) throws Exception {
        requireUser(auth);

        String q = "query($d:DomainName!) { account { listUsers(domain:$d) } }";
        String raw = client.post()
            .body(Map.of("query", q, "variables", Map.of("d", domain)))
            .retrieve()
            .body(String.class);

        JsonNode root = json.readTree(raw);
        Map<String, Object> out = new LinkedHashMap<>();
        if (root.has("errors")) {
            out.put("ok", false);
            out.put("errors", json.convertValue(root.get("errors"), Object.class));
        } else {
            out.put("ok", true);
            out.put("domain", domain);
            out.put("users", json.convertValue(root.path("data").path("account").path("listUsers"), Object.class));
        }
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
}
