package com.example.notice;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 서버 식별용 무인증 핑. 앱(폰)이 같은 와이파이에서 서브넷을 훑어
 * "우리 서버"를 찾을 때 마커로 사용. (GET /ping → {"app":"kakao-clone"})
 */
@RestController
public class PingController {

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of("app", "kakao-clone", "ok", true);
    }
}
