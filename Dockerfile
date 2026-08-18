# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY scripts/ ../scripts/
RUN npm run build && npm run budget

FROM rust:1.97.1-alpine AS rust
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY migrations/ ./migrations/
# Without these mounts every image build re-downloads the registry and
# recompiles the whole dependency tree, even when only crate sources changed.
RUN --mount=type=cache,id=control-plane-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=control-plane-cargo-git,target=/usr/local/cargo/git/db,sharing=locked \
    --mount=type=cache,id=control-plane-target,target=/src/target,sharing=locked \
    cargo build --release --locked \
    && install --directory /out \
    && install --mode 0755 target/release/crowdrelay-control-plane-api /out/control-plane

FROM alpine:3.22
RUN addgroup -S controlplane && adduser -S -G controlplane controlplane
WORKDIR /app
COPY --from=rust /out/control-plane /usr/local/bin/control-plane
COPY --from=web /src/frontend/dist /app/frontend/dist
USER controlplane
ENV CONTROL_PLANE_BIND=0.0.0.0:8090 CONTROL_PLANE_FRONTEND_DIST=/app/frontend/dist
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/control-plane"]
