# ── Build stage ──────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# 의존성 캐시: pom.xml 만 먼저 복사해서 dependency:go-offline 실행
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q package -DskipTests \
    && mv target/notice-server-*.jar /app/app.jar

# ── Runtime stage ────────────────────────────────────────────
FROM eclipse-temurin:21-jre
WORKDIR /app

# healthcheck 용 curl. 이미지 작게 유지 위해 recommends 끔.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/app.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
