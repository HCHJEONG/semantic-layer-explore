FROM rust:1.83-alpine AS build
WORKDIR /src
RUN apk add --no-cache musl-dev
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM alpine:3.20
WORKDIR /app
COPY --from=build /src/target/release/semantic-graph-worker /app/semantic-graph-worker
CMD ["/app/semantic-graph-worker"]
