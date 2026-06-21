package com.example.notice;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * 로그인 / 토큰 검증 엔드포인트.
 *
 *   POST /auth/login   { "user", "password" } → { token, user, role, expiresInMs }
 *   GET  /auth/verify  Authorization: Bearer <token> → { user, role, exp }
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserService users;
    private final JwtUtil jwt;

    public AuthController(UserService users, JwtUtil jwt) {
        this.users = users;
        this.jwt = jwt;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        String user = body.get("user");
        String pass = body.get("password");
        log.debug("[DBG:login:1] 로그인 요청 user={}", user);
        if (user == null || pass == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "user + password required");
        }
        log.debug("[DBG:login:2] UserService.verify() 호출 → Mongoose checkPassword");
        if (!users.verify(user, pass)) {
            log.debug("[DBG:login:ERR] 비밀번호 불일치 → 401");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials");
        }
        log.debug("[DBG:login:3] 비밀번호 검증 성공");
        String role = users.roleOf(user);
        log.debug("[DBG:login:4] Redis role 조회 완료 role={}", role);
        String token = jwt.issue(user, role);
        log.debug("[DBG:login:5] JWT 발급 완료 → 응답 반환");
        return Map.of(
            "token",        token,
            "user",         user,
            "role",         role,
            "expiresInMs",  jwt.expirationMs()
        );
    }

    /**
     * 회원가입. 성공 시 즉시 JWT 발급(자동 로그인). role 은 default `user`.
     *   POST /auth/register  { "user", "password" }
     */
    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, String> body) {
        String user = body.get("user");
        String pass = body.get("password");
        log.debug("[DBG:register:1] 회원가입 요청 user={}", user);
        try {
            log.debug("[DBG:register:2] UserService.register() 진입 → 유효성검사/Redis중복/Mongoose등록");
            users.register(user, pass);
            log.debug("[DBG:register:3] 등록 완료 → JWT 발급");
        } catch (UserService.RegisterException e) {
            HttpStatus s = switch (e.code) {
                case BAD_INPUT    -> HttpStatus.BAD_REQUEST;
                case CONFLICT     -> HttpStatus.CONFLICT;
                case SERVER_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
            };
            throw new ResponseStatusException(s, e.getMessage());
        }
        String u = user.trim();
        String role = users.roleOf(u);
        String token = jwt.issue(u, role);
        return Map.of(
            "token",        token,
            "user",         u,
            "role",         role,
            "expiresInMs",  jwt.expirationMs()
        );
    }

    @GetMapping("/verify")
    public Map<String, Object> verify(@RequestHeader(value = "Authorization", required = false) String auth) {
        String token = extractBearer(auth);
        try {
            Claims c = jwt.verify(token);
            return Map.of(
                "user", c.getSubject(),
                "role", c.get("role"),
                "exp",  c.getExpiration().toInstant().toString()
            );
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid token: " + e.getMessage());
        }
    }

    /**
     * 토큰 갱신.
     *   POST /auth/refresh
     *   Authorization: Bearer <현재 token (만료 전)>
     *   → {token, user, role, expiresInMs}
     *
     *  - 만료된 토큰은 401 (만료 전에 미리 갱신해야 함, 클라가 5분 전 자동 호출).
     *  - 같은 sub/role 로 새 JWT 발급. role 변경 반영하고 싶으면 Redis에서 최신값 재조회.
     */
    @PostMapping("/refresh")
    public Map<String, Object> refresh(@RequestHeader(value = "Authorization", required = false) String auth) {
        String token = extractBearer(auth);
        Claims c;
        try {
            c = jwt.verify(token);
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid or expired token: " + e.getMessage());
        }
        String user = c.getSubject();
        // role 은 Redis에서 최신값 조회 (admin 격하/승격 반영)
        String role = users.roleOf(user);
        String fresh = jwt.issue(user, role);
        return Map.of(
            "token",        fresh,
            "user",         user,
            "role",         role,
            "expiresInMs",  jwt.expirationMs()
        );
    }

    static String extractBearer(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "missing Bearer token");
        }
        return authHeader.substring("Bearer ".length()).trim();
    }
}
