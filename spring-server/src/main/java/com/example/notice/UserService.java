package com.example.notice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * 사용자 비밀번호(계정) 검증 — Mongoose GraphQL 위임. (JWT 발급/검증은 Spring·plain-ws 자체, Mongoose 무관)
 *
 *   verify(user, password) → Mongoose :5551 account.checkPassword 호출.
 *   roleOf(user)           → Redis Hash auth:user:{user} 의 role 필드 (Mongoose는 role 개념 없음).
 *   부팅 시 seed:
 *     1) Redis 에 role 만 HSET (admin / user 구분용)
 *     2) Mongoose 에 registerUser 시도 (이미 있으면 errors 로 떨어지지만 무시 — 동기화 보장).
 *
 * 운영 단계로 갈 때:
 *   - 가입 API 추가: changeUserPassword + registerUser 양쪽 호출
 *   - bcrypt 는 Mongoose 내부 알고리즘이 처리 (mod_register 설정 따라)
 */
@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final StringRedisTemplate redis;
    private final SeedProps seedProps;
    private final RestClient mongoose;
    private final String domain;
    private final ObjectMapper json = new ObjectMapper();

    public UserService(StringRedisTemplate redis,
                       SeedProps seedProps,
                       @Value("${mongooseim.graphql.url}") String url,
                       @Value("${mongooseim.graphql.user}") String mongoUser,
                       @Value("${mongooseim.graphql.pass}") String mongoPass,
                       @Value("${mongooseim.domain:localhost}") String domain) {
        this.redis = redis;
        this.seedProps = seedProps;
        this.domain = domain;
        String basic = "Basic " + Base64.getEncoder().encodeToString(
            (mongoUser + ":" + mongoPass).getBytes(StandardCharsets.UTF_8));
        // Mongoose Cowboy 와의 keep-alive 호환 이슈 회피 — HttpURLConnection 기반으로 강제.
        // (기본 JdkClientHttpRequestFactory 사용 시 EOF reached / Broken pipe 빈발.)
        this.mongoose = RestClient.builder()
            .baseUrl(url)
            .defaultHeader("Authorization", basic)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .requestFactory(new SimpleClientHttpRequestFactory())
            .build();
        log.info("UserService → Mongoose auth delegate enabled (url={}, domain={})", url, domain);
    }

    private static String key(String user) { return "auth:user:" + user; }

    @PostConstruct
    public void seed() {
        for (Seed s : seedProps.getSeed()) {
            // 1) Redis 에 role 만 (Mongoose 는 role 모름)
            redis.opsForHash().put(key(s.getUsername()), "role", s.getRole());

            // 2) Mongoose 에 사용자 등록 시도 (이미 있으면 errors 로 떨어짐 — 정상)
            tryRegisterMongoose(s.getUsername(), s.getPassword());
        }
    }

    /** 비밀번호 검증 — Mongoose 위임. */
    public boolean verify(String user, String rawPassword) {
        String q = "query($u:JID!,$p:String!){ account{ checkPassword(user:$u, password:$p){ correct } } }";
        String jid = user + "@" + domain;
        log.debug("[DBG:verify:1] Mongoose checkPassword 호출 jid={}", jid);
        try {
            String raw = mongoose.post()
                .body(Map.of("query", q, "variables", Map.of("u", jid, "p", rawPassword)))
                .retrieve()
                .body(String.class);
            JsonNode root = json.readTree(raw);
            if (root.has("errors")) {
                log.warn("checkPassword errors for {}: {}", jid, root.get("errors"));
                return false;
            }
            boolean correct = root.path("data").path("account").path("checkPassword").path("correct").asBoolean(false);
            log.debug("[DBG:verify:2] checkPassword 응답 correct={}", correct);
            return correct;
        } catch (Exception e) {
            log.warn("checkPassword call failed for {}: {}", jid, e.getMessage());
            return false;
        }
    }

    public String roleOf(String user) {
        Object r = redis.opsForHash().get(key(user), "role");
        return r == null ? "user" : r.toString();
    }

    public boolean exists(String user) {
        return Boolean.TRUE.equals(redis.hasKey(key(user)));
    }

    /**
     * 신규 사용자 가입.
     *   1) 입력 검증 (username/password 규칙)
     *   2) Redis 충돌 체크 (auth:user:{user})
     *   3) Mongoose registerUser GraphQL
     *   4) Redis role=user 시드
     * 충돌/실패 시 RegisterException 던짐 — AuthController 가 HTTP status로 매핑.
     */
    public void register(String user, String password) {
        if (user == null || password == null) {
            throw new RegisterException(RegisterError.BAD_INPUT, "user + password required");
        }
        String u = user.trim();
        if (!u.matches("[a-z0-9_]{3,20}")) {
            throw new RegisterException(RegisterError.BAD_INPUT,
                "username은 소문자 영문/숫자/언더스코어, 3~20자");
        }
        if (password.length() < 4 || password.length() > 64) {
            throw new RegisterException(RegisterError.BAD_INPUT, "password는 4~64자");
        }
        log.debug("[DBG:register:A] Redis 중복 체크 key=auth:user:{}", u);
        if (exists(u)) {
            log.debug("[DBG:register:ERR] 이미 존재하는 사용자 → 409 Conflict");
            throw new RegisterException(RegisterError.CONFLICT, "이미 가입된 사용자");
        }

        log.debug("[DBG:register:B] Mongoose registerUser 호출 domain={} username={}", domain, u);
        // Mongoose에 등록 시도
        String q = "mutation($d:DomainName!,$u:UserName,$p:String!){"
                 + " account{ registerUser(domain:$d, username:$u, password:$p){ message } } }";
        try {
            String raw = mongoose.post()
                .body(Map.of("query", q, "variables", Map.of("d", domain, "u", u, "p", password)))
                .retrieve()
                .body(String.class);
            JsonNode root = json.readTree(raw);
            if (root.has("errors")) {
                String msg = root.get("errors").get(0).path("message").asText("");
                if (msg.contains("already registered") || msg.contains("exists")) {
                    // Mongoose엔 있는데 Redis엔 없는 케이스 — role만 시드해서 정합 맞춤
                    redis.opsForHash().put(key(u), "role", "user");
                    throw new RegisterException(RegisterError.CONFLICT,
                        "이미 Mongoose에 등록된 사용자 (role만 시드함)");
                }
                throw new RegisterException(RegisterError.SERVER_ERROR,
                    "Mongoose 등록 실패: " + msg);
            }
        } catch (RegisterException re) {
            throw re;
        } catch (Exception e) {
            log.warn("registerUser call failed for {}: {}", u, e.getMessage());
            throw new RegisterException(RegisterError.SERVER_ERROR,
                "Mongoose 호출 실패: " + e.getMessage());
        }

        log.debug("[DBG:register:C] Mongoose 등록 성공 → Redis HSET auth:user:{} role=user", u);
        // Redis role 시드 (default user)
        redis.opsForHash().put(key(u), "role", "user");
        log.info("register ok: user={} domain={}", u, domain);
    }

    public enum RegisterError { BAD_INPUT, CONFLICT, SERVER_ERROR }

    public static class RegisterException extends RuntimeException {
        public final RegisterError code;
        public RegisterException(RegisterError code, String msg) {
            super(msg);
            this.code = code;
        }
    }

    /** Mongoose 시드 등록 — 이미 존재하면 errors 떨어져도 무시. */
    private void tryRegisterMongoose(String username, String password) {
        String q = "mutation($d:DomainName!,$u:UserName,$p:String!){"
                 + " account{ registerUser(domain:$d, username:$u, password:$p){ message } } }";
        try {
            String raw = mongoose.post()
                .body(Map.of("query", q, "variables", Map.of("d", domain, "u", username, "p", password)))
                .retrieve()
                .body(String.class);
            JsonNode root = json.readTree(raw);
            if (root.has("errors")) {
                String msg = root.get("errors").get(0).path("message").asText("");
                if (msg.contains("already registered") || msg.contains("exists")) {
                    log.info("mongoose seed '{}': already registered (ok)", username);
                } else {
                    log.warn("mongoose seed '{}' rejected: {}", username, msg);
                }
            } else {
                log.info("mongoose seed '{}': registered", username);
            }
        } catch (Exception e) {
            log.warn("mongoose seed '{}' failed: {}", username, e.getMessage());
        }
    }

    // ── 시드 yaml binding ────────────────────────────────────
    @Configuration
    @ConfigurationProperties(prefix = "auth")
    public static class SeedProps {
        private List<Seed> seed = new ArrayList<>();
        public List<Seed> getSeed() { return seed; }
        public void setSeed(List<Seed> seed) { this.seed = seed; }
    }

    public static class Seed {
        private String username;
        private String password;
        private String role = "user";
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
    }
}
