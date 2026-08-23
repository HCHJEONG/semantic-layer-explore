use std::time::Duration;

use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().init();
    let group = std::env::var("GRAPH_CONSUMER_GROUP")
        .unwrap_or_else(|_| "physicalai-graph-projectors".to_string());
    info!(consumer_group = group, "semantic graph worker skeleton started");
    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                info!("semantic graph worker stopping");
                return Ok(());
            }
            _ = tokio::time::sleep(Duration::from_secs(30)) => {
                info!("waiting for semantic.graph.rebuild or semantic.relation.changed wiring");
            }
        }
    }
}
