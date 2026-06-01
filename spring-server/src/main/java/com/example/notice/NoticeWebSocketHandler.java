package com.example.notice;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 공지 push WebSocket 핸들러.
 *
 *   ws://localhost:8081/ws/notice?token=<JWT>
 *
 * - 연결 시 token 검증 (없거나 invalid 면 1008 종료)
 * - Redis pub/sub("notice.broadcast") 수신 시 모든 활성 세션에 fan-out
 * - 한 사용자가 여러 디바이스로 붙어 있으면 모두 받음
 */
@Component
public class NoticeWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(NoticeWebSocketHandler.class);

    private final JwtUtil jwt;
    private final ObjectMapper json = new ObjectMapper();

    /** sessionId → session */
    private final ConcurrentMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public NoticeWebSocketHandler(JwtUtil jwt) {
        this.jwt = jwt;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String token = queryParam(session.getUri(), "token");
        if (token == null) {
            close(session, CloseStatus.POLICY_VIOLATION, "token required (?token=...)");
            return;
        }
        try {
            Claims c = jwt.verify(token);
            session.getAttributes().put("user", c.getSubject());
            session.getAttributes().put("role", c.get("role"));
            sessions.put(session.getId(), session);
            send(session, Map.of(
                "type", "hello",
                "user", c.getSubject(),
                "subscribers", sessions.size()
            ));
            log.info("notice WS connected user={} sid={} (total={})",
                c.getSubject(), session.getId(), sessions.size());
        } catch (JwtException e) {
            close(session, CloseStatus.POLICY_VIOLATION, "invalid token");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        log.info("notice WS closed sid={} status={} (remaining={})",
            session.getId(), status, sessions.size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // 공지 채널은 서버→클라이언트 push 전용. 클라 메시지는 무시(또는 ping/pong 용).
        log.debug("ignored client text from {}: {}", session.getId(), message.getPayload());
    }

    /**
     * Redis pub/sub 수신 콜백 (AppConfig 의 MessageListenerAdapter 가 invokeMethod 로 호출).
     * payload 는 JSON 문자열을 그대로 모든 세션에 전달.
     */
    @SuppressWarnings("unused")
    public void onRedisNotice(String payload) {
        log.info("redis notice received → fan-out to {} sessions", sessions.size());
        broadcast(payload);
    }

    /** 로컬 모든 세션에 텍스트 그대로 전송 */
    public void broadcast(String text) {
        for (WebSocketSession s : sessions.values()) {
            if (!s.isOpen()) continue;
            try { s.sendMessage(new TextMessage(text)); }
            catch (IOException e) { log.warn("send fail sid={}: {}", s.getId(), e.getMessage()); }
        }
    }

    public int subscriberCount() { return sessions.size(); }

    public List<String> activeUsers() {
        return sessions.values().stream()
            .map(s -> (String) s.getAttributes().get("user"))
            .toList();
    }

    // ── helpers ───────────────────────────────────────────────
    private void send(WebSocketSession s, Map<String, Object> body) throws IOException {
        s.sendMessage(new TextMessage(json.writeValueAsString(body)));
    }

    private void close(WebSocketSession s, CloseStatus status, String reason) {
        try { s.close(status.withReason(reason)); } catch (IOException ignored) {}
    }

    private static String queryParam(URI uri, String name) {
        if (uri == null || uri.getQuery() == null) return null;
        for (String kv : uri.getQuery().split("&")) {
            int eq = kv.indexOf('=');
            if (eq > 0 && kv.substring(0, eq).equals(name)) {
                return kv.substring(eq + 1);
            }
        }
        return null;
    }
}
