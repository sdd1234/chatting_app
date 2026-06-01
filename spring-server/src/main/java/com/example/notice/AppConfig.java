package com.example.notice;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class AppConfig implements WebSocketConfigurer {

    private final NoticeWebSocketHandler handler;

    public AppConfig(NoticeWebSocketHandler handler) {
        this.handler = handler;
    }

    /**
     * WebSocket 엔드포인트:
     *   ws://localhost:8081/ws/notice  → 공지 broadcast 채널
     */
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/notice").setAllowedOriginPatterns("*");
    }

    /**
     * Redis pub/sub: notice.broadcast 채널 구독 → handler.onRedisNotice
     * (멀티 인스턴스 대비 — 한 노드에서 publish 하면 모든 노드 구독자에게 fan-out)
     */
    @Bean
    public RedisMessageListenerContainer redisListenerContainer(
            RedisConnectionFactory cf,
            NoticeWebSocketHandler handler,
            @Value("${notice.channel}") String channel) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(cf);
        MessageListenerAdapter adapter = new MessageListenerAdapter(handler, "onRedisNotice");
        adapter.setSerializer(new StringRedisSerializer());
        adapter.afterPropertiesSet();
        container.addMessageListener(adapter, new PatternTopic(channel));
        return container;
    }

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory cf) {
        return new StringRedisTemplate(cf);
    }

    /** 개발 편의: 모든 origin 허용. 운영 시 화이트리스트로 좁힐 것. */
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.addAllowedOriginPattern("*");
        cfg.addAllowedHeader("*");
        cfg.addAllowedMethod("*");
        cfg.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return new CorsFilter(source);
    }
}
