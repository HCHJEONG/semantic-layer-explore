mod consumer;
mod neo4j;
mod projection;

use anyhow::Context;
use neo4j::Neo4jClient;
use tracing::{error, info};

fn env(key: &str, fallback: &str) -> String { std::env::var(key).unwrap_or_else(|_| fallback.to_string()) }

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().init();
    let brokers = env("KAFKA_BROKERS", "kafka:9092");
    let group = env("GRAPH_CONSUMER_GROUP", "physicalai-graph-projectors");
    let (postgres, connection) = tokio_postgres::connect(&env("DATABASE_URL", "postgres://physicalai:physicalai@postgres:5432/physicalai"), tokio_postgres::NoTls).await.context("connect PostgreSQL")?;
    tokio::spawn(async move { if let Err(error) = connection.await { error!(%error, "PostgreSQL connection failed"); } });
    let neo4j = Neo4jClient::new(env("NEO4J_HTTP_URL", "http://neo4j:7474/db/neo4j/tx/commit"), env("NEO4J_USER", "neo4j"), env("NEO4J_PASSWORD", "physicalai"));
    info!(consumer_group = group, "semantic graph worker started");
    consumer::run(&brokers, &group, |event| {
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
