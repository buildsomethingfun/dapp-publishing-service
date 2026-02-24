# Stage 1: Build TypeScript
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

WORKDIR /build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Stage 2: Runtime with Android SDK + JDK
FROM eclipse-temurin:17-jdk

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# Install Android SDK command-line tools
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && cd /tmp \
    && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o cmdline-tools.zip \
    && unzip -q cmdline-tools.zip \
    && mv cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm cmdline-tools.zip

# Accept licenses and install SDK components
RUN yes | sdkmanager --licenses > /dev/null 2>&1 \
    && sdkmanager --install \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "platform-tools"

WORKDIR /app

# Copy built TypeScript
COPY --from=builder /build/dist/ ./dist/
COPY --from=builder /build/node_modules/ ./node_modules/
COPY package.json ./

# Copy WebView template (without node_modules — installed below)
COPY webview-template/app/ ./webview-template/app/
COPY webview-template/gradle/ ./webview-template/gradle/
COPY webview-template/www/ ./webview-template/www/
COPY webview-template/build.gradle.kts ./webview-template/
COPY webview-template/settings.gradle.kts ./webview-template/
COPY webview-template/gradle.properties ./webview-template/
COPY webview-template/gradlew ./webview-template/
COPY webview-template/capacitor.config.json ./webview-template/
COPY webview-template/package.json webview-template/pnpm-lock.yaml ./webview-template/

# Install Capacitor dependencies
RUN cd webview-template && pnpm install --frozen-lockfile

# Pre-warm Gradle cache: download the distribution
RUN cd webview-template && chmod +x gradlew && ./gradlew --version --no-daemon || true

EXPOSE 3000

CMD ["node", "dist/index.js"]
