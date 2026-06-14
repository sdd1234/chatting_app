package com.example.notice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 파일/이미지 업로드·다운로드. 로컬 폴더 저장(MinIO 대신 — 사용자 결정).
 *
 *   POST /files/upload   (multipart, field 'file')   Authorization: Bearer <JWT>
 *       → { id, name, mime, size }   (expo 는 SPRING_BASE/files/{id} 로 url 구성)
 *   GET  /files/{id}     인증 필요 — Authorization: Bearer <JWT> 또는 ?token=<JWT>
 *       (브라우저 <img>/<a> 는 헤더를 못 실으므로 ?token= 쿼리도 허용)
 *       권한 범위 = "인증된 사용자". 채팅 수신자도 받아야 하고 .meta 엔 수신자가
 *       기록되지 않으므로(업로드가 전송보다 먼저·단톡 가능) owner-only 로 막지 않는다.
 *
 * 저장 구조: {storage.dir}/{id}        = 원본 바이트
 *           {storage.dir}/{id}.meta   = { name, mime, size, owner } JSON
 *
 * ⚠️ 업로드된 실제 파일은 git 에 올리지 않는다(.gitignore: spring-server/uploads/).
 *    도커 기동 시엔 이 폴더를 호스트 볼륨으로 마운트해 바탕화면 프로젝트 폴더에 쌓이게 한다.
 */
@RestController
@RequestMapping("/files")
public class FileController {

    private static final Logger log = LoggerFactory.getLogger(FileController.class);

    private final JwtUtil jwt;
    private final ObjectMapper json = new ObjectMapper();
    private final Path dir;

    public FileController(JwtUtil jwt, @Value("${file.storage.dir:uploads}") String storageDir) {
        this.jwt = jwt;
        this.dir = Paths.get(storageDir).toAbsolutePath().normalize();
    }

    @PostConstruct
    void init() throws IOException {
        Files.createDirectories(dir);
        log.info("File storage dir → {}", dir);
    }

    @PostMapping("/upload")
    public Map<String, Object> upload(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam("file") MultipartFile file) {
        Claims c = requireUser(auth);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "field 'file' required");
        }

        String id = UUID.randomUUID().toString().replace("-", "");
        String name = sanitizeName(file.getOriginalFilename());
        String mime = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        try {
            Files.copy(file.getInputStream(), dir.resolve(id), StandardCopyOption.REPLACE_EXISTING);
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("name", name);
            meta.put("mime", mime);
            meta.put("size", file.getSize());
            meta.put("owner", c.getSubject());
            json.writeValue(dir.resolve(id + ".meta").toFile(), meta);
        } catch (IOException e) {
            log.error("file save failed", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "save failed: " + e.getMessage());
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.put("mime", mime);
        out.put("size", file.getSize());
        return out;
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> download(
            @PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(value = "token", required = false) String token,
            @RequestParam(value = "dl", required = false) String dl) {
        Claims c = requireUserFlexible(auth, token);   // 헤더 또는 ?token= — 둘 다 없으면 401
        if (!id.matches("[a-zA-Z0-9]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad id");
        }
        Path f = dir.resolve(id);
        if (!Files.exists(f)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "not found");
        }
        try {
            byte[] bytes = Files.readAllBytes(f);
            String mime = "application/octet-stream";
            String name = id;
            Path metaPath = dir.resolve(id + ".meta");
            if (Files.exists(metaPath)) {
                JsonNode meta = json.readTree(metaPath.toFile());
                mime = meta.path("mime").asText(mime);
                name = meta.path("name").asText(name);
                String owner = meta.path("owner").asText("");
                if (!owner.isEmpty() && !owner.equals(c.getSubject())) {
                    log.debug("file {} downloaded by {} (owner {})", id, c.getSubject(), owner);
                }
            }
            // ?dl=1 이면 attachment(브라우저 다운로드 강제), 아니면 inline(미리보기).
            // 한글 파일명은 RFC 5987 filename* 로, 폴백은 ASCII 로 안전하게.
            boolean attach = dl != null && !dl.isBlank();
            String enc = URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20");
            String ascii = name.replaceAll("[^\\x20-\\x7E]", "_").replace("\"", "_");
            String disp = (attach ? "attachment" : "inline")
                    + "; filename=\"" + ascii + "\"; filename*=UTF-8''" + enc;
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(mime))
                    .header(HttpHeaders.CONTENT_DISPOSITION, disp)
                    .body(bytes);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "read failed: " + e.getMessage());
        }
    }

    private Claims requireUser(String authHeader) {
        String token = AuthController.extractBearer(authHeader);
        try {
            return jwt.verify(token);
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid or expired token: " + e.getMessage());
        }
    }

    /**
     * 다운로드 인증: Bearer 헤더 우선, 없으면 ?token= 쿼리 파라미터로 폴백.
     * (브라우저 <img src>/<a href> 는 커스텀 헤더를 못 싣기 때문에 쿼리 허용)
     * 둘 다 없거나 무효/만료면 401.
     */
    private Claims requireUserFlexible(String authHeader, String queryToken) {
        String token = (authHeader != null && authHeader.startsWith("Bearer "))
                ? authHeader.substring("Bearer ".length()).trim()
                : queryToken;
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "token required");
        }
        try {
            return jwt.verify(token);
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid or expired token: " + e.getMessage());
        }
    }

    /** 경로 조작 방지 — 파일명에서 디렉토리 구분자 제거. */
    private static String sanitizeName(String name) {
        if (name == null || name.isBlank()) return "file";
        return name.replaceAll("[/\\\\]", "_");
    }
}
