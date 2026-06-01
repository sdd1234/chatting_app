package com.example.notice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * MongooseIM GraphQL Admin (포트 5551) 프록시.
 *
 *   POST /admin/mongoose/query
 *     Authorization: Bearer <admin JWT>
 *     body: { "query": "...", "variables": {...} }
 *     → Basic Auth admin:secret 으로 MongooseIM 의 /api/graphql 호출 후 결과 그대로 반환.
 *
 *   GET /admin/mongoose/stats
 *     자주 쓰는 쿼리(uptime/registered/online) 미리 박은 편의 엔드포인트.
 *
 * 왜 프록시:
 *   - 클라(브라우저)는 admin:secret 비밀번호를 알면 안 됨. Spring 이 대신 들고 있고
 *     클라는 자기 JWT 만 들고 와서 admin role 검증 후 통과.
 *   - mongoose 5551 의 인증은 단순 Basic Auth 한 가지뿐이라 프록시가 충분 (사용자별 자격
 *     필요한 5561 user endpoint 는 프록시하지 않음).
 */
@RestController
@RequestMapping("/admin/mongoose")
public class MongooseGraphqlController {

    private static final Logger log = LoggerFactory.getLogger(MongooseGraphqlController.class);

    private final JwtUtil jwt;
    private final RestClient client;
    private final ObjectMapper json = new ObjectMapper();

    public MongooseGraphqlController(
            JwtUtil jwt,
            @Value("${mongooseim.graphql.url}") String url,
            @Value("${mongooseim.graphql.user}") String user,
            @Value("${mongooseim.graphql.pass}") String pass) {
        this.jwt = jwt;
        String basic = "Basic " + Base64.getEncoder().encodeToString(
            (user + ":" + pass).getBytes(StandardCharsets.UTF_8));
        // Cowboy 호환 — SimpleClientHttpRequestFactory(HttpURLConnection) 강제
        this.client = RestClient.builder()
            .baseUrl(url)
            .defaultHeader("Authorization", basic)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .requestFactory(new SimpleClientHttpRequestFactory())
            .build();
        log.info("MongooseIM GraphQL proxy → {}", url);
    }

    /**
     * 임의 GraphQL 쿼리 패스스루.
     * 응답을 그대로 (status + body) 클라에 반환.
     */
    @PostMapping("/query")
    public ResponseEntity<String> query(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        requireAdmin(auth);
        if (!body.containsKey("query")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "field 'query' required");
        }
        try {
            String response = client.post()
                .body(body)
                .retrieve()
                .body(String.class);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
        } catch (Exception e) {
            log.error("graphql call failed", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "mongoose graphql call failed: " + e.getMessage());
        }
    }

    /**
     * 자주 쓰는 통계 (uptime / online / registered) 한 번에.
     */
    @GetMapping("/stats")
    public Map<String, Object> stats(
            @RequestHeader(value = "Authorization", required = false) String auth) throws Exception {
        requireAdmin(auth);

        // 실제 schema: root 'stat'(단수) > 'globalStats' object > {uptimeSeconds, onlineUsers, registeredUsers}
        // (이전엔 'stats { uptimeSeconds onlineUsersNumber registeredUsers }' 로 잘못 쿼리해서 500 떨어졌었음)
        String q = "query { stat { globalStats { uptimeSeconds onlineUsers registeredUsers } } }";
        String raw = client.post()
            .body(Map.of("query", q))
            .retrieve()
            .body(String.class);

        JsonNode root = json.readTree(raw);
        Map<String, Object> out = new LinkedHashMap<>();
        if (root.has("errors")) {
            out.put("ok", false);
            out.put("errors", json.convertValue(root.get("errors"), Object.class));
            return out;
        }
        JsonNode stats = root.path("data").path("stat").path("globalStats");
        out.put("ok", true);
        out.put("uptimeSeconds",   stats.path("uptimeSeconds").asLong());
        out.put("onlineUsers",     stats.path("onlineUsers").asLong());
        out.put("registeredUsers", stats.path("registeredUsers").asLong());
        return out;
    }

    /**
     * 사용자 목록 (한 도메인의 등록된 모든 user).
     * mongoose schema 의 account.listUsers(domain:"localhost") 사용.
     */
    @GetMapping("/users")
    public Map<String, Object> users(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(defaultValue = "localhost") String domain) throws Exception {
        requireAdmin(auth);

        // listUsers(domain:DomainName!) — String! 변수로 보내면 type_mismatch.
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

    private Claims requireAdmin(String authHeader) {
        String token = AuthController.extractBearer(authHeader);
        try {
            Claims c = jwt.verify(token);
            if (!"admin".equals(c.get("role"))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin role required");
            }
            return c;
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid token: " + e.getMessage());
        }
    }
}
