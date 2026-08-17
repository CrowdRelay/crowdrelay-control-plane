FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json ./package.json
RUN npm install --no-audit --no-fund
COPY frontend/ ./
COPY scripts/ ../scripts/
RUN npm run build && npm run budget

FROM rust:1.97-alpine AS rust
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /src
COPY Cargo.toml ./
COPY crates/ ./crates/
COPY migrations/ ./migrations/
RUN cargo build --release

FROM alpine:3.22
RUN addgroup -S controlplane && adduser -S -G controlplane controlplane
WORKDIR /app
COPY --from=rust /src/target/release/crowdrelay-control-plane-api /usr/local/bin/control-plane
COPY --from=web /src/frontend/dist /app/frontend/dist
USER controlplane
ENV CONTROL_PLANE_BIND=0.0.0.0:8090 CONTROL_PLANE_FRONTEND_DIST=/app/frontend/dist
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/control-plane"]
