package com.example.notice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.beans.factory.annotation.Value;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * 친구 목록 — PostgreSQL 영구 저장 (B안).
 *
 *   GET    /friends                Authorization: Bearer
 *     → { friends: ["alice", "bob", ...] }
 *
 *   POST   /friends/add            Authorization: Bearer
 *     body: { "target": "alice" }
 *     → { ok: true, target: "alice" }   (회원 아닌 경우 404)
 *
 *   DELETE /friends/{target}       Authorization: Bearer
 *     → { ok: true }
 *
 * 회원 여부 확인: Mongoose GraphQL listUsers 결과에 포함 여부로 체크.
 * 저장: friends 테이블 (owner, friend) PK — schema.sql 이 앱 시작 시 CREATE IF NOT EXISTS.
 */
@RestController
@RequestMapping("/friends")
public class FriendController {

    private static final Logger log = LoggerFactory.getLogger(FriendController.class);

    private final JwtUtil jwt;
    private final JdbcTemplate db;
    private final RestClient mongoose;
    private final String domain;
    private final ObjectMapper json = new ObjectMapper();

    public FriendController(
            JwtUtil jwt,
            JdbcTemplate db,
            @Value("${mongooseim.graphql.url}") String url,
            @Value("${mongooseim.graphql.user}") String user,
            @Value("${mongooseim.graphql.pass}") String pass,
            @Value("${mongooseim.domain:localhost}") String domain) {
        this.jwt = jwt;
        this.db = db;
        this.domain = domain;
        String basic = "Basic " + Base64.getEncoder().encodeToString(
            (user + ":" + pass).getBytes(StandardCharsets.UTF_8));
        this.mongoose = RestClient.builder()
            .baseUrl(url)
            .defaultHeader("Authorization", basic)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .requestFactory(new SimpleClientHttpRequestFactory())
            .build();
    }

    @GetMapping
    public Map<String, Object> list(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String me = extractUser(auth);
        List<String> friends = db.queryForList(
            "SELECT friend FROM friends WHERE owner = ? ORDER BY created_at", String.class, me);
        log.debug("[DBG:friends:get] user={} count={}", me, friends.size());
        return Map.of("friends", friends);
    }

    @PostMapping("/add")
    public Map<String, Object> add(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, String> body) {
        String me = extractUser(auth);
        String target = body.get("target");
        if (target == null || target.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "target required");
        }
        target = target.trim();
        if (target.equals(me)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자기 자신은 추가할 수 없습니다");
        }

        log.debug("[DBG:friends:add] owner={} target={}", me, target);

        // Mongoose listUsers로 회원 여부 확인
        if (!isMember(target)) {
            log.debug("[DBG:friends:add] {} 는 미가입 회원", target);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "존재하지 않는 회원입니다: " + target);
        }

        // INSERT OR IGNORE (이미 있으면 무시)
        db.update(
            "INSERT INTO friends (owner, friend) VALUES (?, ?) ON CONFLICT DO NOTHING",
            me, target);
        log.debug("[DBG:friends:add] 저장 완료 owner={} friend={}", me, target);
        return Map.of("ok", true, "target", target);
    }

    @DeleteMapping("/{target}")
    public Map<String, Object> remove(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String target) {
        String me = extractUser(auth);
        log.debug("[DBG:friends:del] owner={} target={}", me, target);
        db.update("DELETE FROM friends WHERE owner = ? AND friend = ?", me, target);
        return Map.of("ok", true);
    }

    private boolean isMember(String username) {
        try {
            String q = "query($d:DomainName!) { account { listUsers(domain:$d) } }";
            String raw = mongoose.post()
                .body(Map.of("query", q, "variables", Map.of("d", domain)))
                .retrieve()
                .body(String.class);
            JsonNode root = json.readTree(raw);
            if (root.has("errors")) return false;
            String jid = username + "@" + domain;
            for (JsonNode u : root.path("data").path("account").path("listUsers")) {
                if (jid.equalsIgnoreCase(u.asText())) return true;
            }
            return false;
        } catch (Exception e) {
            log.warn("isMember check failed for {}: {}", username, e.getMessage());
            return false;
        }
    }

    private String extractUser(String authHeader) {
        String token = AuthController.extractBearer(authHeader);
        try {
            Claims c = jwt.verify(token);
            return c.getSubject();
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid token");
        }
    }
}
