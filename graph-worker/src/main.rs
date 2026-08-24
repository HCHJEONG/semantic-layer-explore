mod consumer;
mod neo4j;
mod projection;

use anyhow::Context;
use neo4j::Neo4jClient;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tracing::{error, info};

fn env(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

async fn serve_health(port: u16, ready: Arc<AtomicBool>) -> anyhow::Result<()> {
    let listener = TcpListener::bind(("0.0.0.0", port)).await.context("bind health server")?;
    loop {
        let (mut socket, _) = listener.accept().await?;
        let ready = ready.clone();
        tokio::spawn(async move {
            let mut request = [0_u8; 1024];
            let size = socket.read(&mut request).await.unwrap_or(0);
            let line = std::str::from_utf8(&request[..size]).unwrap_or("");
            let is_health = line.starts_with("GET /health ");
            let is_ready = line.starts_with("GET /ready ") && ready.load(Ordering::Acquire);
            let (status, body) = if is_health {
                ("200 OK", r#"{"status":"ok"}"#)
            } else if is_ready {
                ("200 OK", r#"{"status":"ready"}"#)
            } else if line.starts_with("GET /ready ") {
                ("503 Service Unavailable", r#"{"status":"not-ready"}"#)
            } else {
                ("404 Not Found", r#"{"status":"not-found"}"#)
            };
            let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            let _ = socket.write_all(response.as_bytes()).await;
        });
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().init();
    let brokers = env("KAFKA_BROKERS", "kafka:9092");
    let group = env("GRAPH_CONSUMER_GROUP", "physicalai-graph-projectors");
    let health_port = env("HEALTH_PORT", "8081")
        .parse::<u16>()
        .context("parse HEALTH_PORT")?;
    let ready = Arc::new(AtomicBool::new(false));
    tokio::spawn(serve_health(health_port, ready.clone()));
    let (postgres, connection) = tokio_postgres::connect(
        &env(
            "DATABASE_URL",
            "postgres://physicalai:physicalai@postgres:5432/physicalai",
        ),
        tokio_postgres::NoTls,
    )
    .await
    .context("connect PostgreSQL")?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            error!(%error, "PostgreSQL connection failed");
        }
    });
    let neo4j = Neo4jClient::new(env("NEO4J_HTTP_URL", "http://neo4j:7474/db/neo4j/tx/commit"), env("NEO4J_USER", "neo4j"), env("NEO4J_PASSWORD", "physicalai"));
    info!(consumer_group = group, "semantic graph worker started");
    consumer::run(&brokers, &group, ready, |event| {
        let postgres = &postgres;
        let neo4j = &neo4j;
        async move {
            info!(rebuild_id = event.rebuild_id, scope = event.scope, "rebuilding semantic graph");
            projection::rebuild(postgres, neo4j, &event).await?;
            info!(rebuild_id = event.rebuild_id, "semantic graph rebuild completed");
            Ok(())
        }
    }).await
}
