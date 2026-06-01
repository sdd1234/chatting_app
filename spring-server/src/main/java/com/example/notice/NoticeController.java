package com.example.notice;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 공지 발행 API.
 *
 *   POST /admin/notice
 *     Authorization: Bearer <admin JWT>
 *     body:    { "body": "점검 안내", "level": "info" }
 *     응답:    { ok, id, deliveredLocal, channel }
 *
 *   GET /admin/notice/stats
 *     Authorization: Bearer <admin JWT>
 *     → 이 인스턴스에 붙어있는 구독자 수/유저
 *
 * 흐름: admin POST → Redis PUBLISH notice.broadcast → 모든 인스턴스의
 *       NoticeWebSocketHandler.onRedisNotice → 각자 자기 WS 세션에 fan-out.
 */
@RestController
@RequestMapping("/admin/notice")
public class NoticeController {

    private static final Logger log = LoggerFactory.getLogger(NoticeController.class);

    private final JwtUtil jwt;
    private final StringRedisTemplate redis;
    private final NoticeWebSocketHandler handler;
    private final String channel;
    private final ObjectMapper json = new ObjectMapper();

    public NoticeController(JwtUtil jwt,
                            StringRedisTemplate redis,
                            NoticeWebSocketHandler handler,
                            @Value("${notice.channel}") String channel) {
        this.jwt = jwt;
        this.redis = redis;
        this.handler = handler;
        this.channel = channel;
    }

    @PostMapping
    public Map<String, Object> publish(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) throws Exception {

        Claims c = requireAdmin(auth);

        String text = String.valueOf(body.getOrDefault("body", "")).trim();
        if (text.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "body required");
        }

        Map<String, Object> notice = new LinkedHashMap<>();
        notice.put("type",  "notice");
        notice.put("id",    UUID.randomUUID().toString());
        notice.put("level", body.getOrDefault("level", "info"));
        notice.put("body",  text);
        notice.put("from",  c.getSubject());
        notice.put("ts",    Instant.now().toEpochMilli());

        String payload = json.writeValueAsString(notice);
        Long received = redis.convertAndSend(channel, payload);

        log.info("notice published by {} id={} (redis subscribers received={})",
            c.getSubject(), notice.get("id"), received);

        return Map.of(
            "ok",             true,
            "id",             notice.get("id"),
            "channel",        channel,
            "redisSubscribers", received == null ? 0 : received,
            "localSessions",  handler.subscriberCount()
        );
    }

    @GetMapping("/stats")
    public Map<String, Object> stats(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireAdmin(auth);
        return Map.of(
            "localSessions", handler.subscriberCount(),
            "activeUsers",   handler.activeUsers()
        );
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
