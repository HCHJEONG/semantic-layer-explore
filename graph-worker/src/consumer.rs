use anyhow::{Context, Result};
use futures::StreamExt;
use rdkafka::{consumer::{CommitMode, Consumer, StreamConsumer}, message::Message, ClientConfig};
use serde::Deserialize;

pub const GRAPH_REBUILD_TOPIC: &str = "semantic.graph.rebuild";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphRebuild {
    pub schema_version: String,
    pub rebuild_id: String,
    pub requested_at: String,
    #[serde(default = "default_scope")]
    pub scope: String,
}

fn default_scope() -> String { "all".to_string() }

impl GraphRebuild {
    fn validate(&self) -> Result<()> {
        anyhow::ensure!(self.schema_version == "graph-rebuild.v1", "unsupported schemaVersion");
        anyhow::ensure!(!self.rebuild_id.trim().is_empty(), "rebuildId is required");
        anyhow::ensure!(!self.requested_at.trim().is_empty(), "requestedAt is required");
        anyhow::ensure!(matches!(self.scope.as_str(), "all" | "ontology" | "operations"), "invalid scope");
        Ok(())
    }
}

pub async fn run<F, Fut>(brokers: &str, group: &str, mut handle: F) -> Result<()>
where
    F: FnMut(GraphRebuild) -> Fut,
    Fut: std::future::Future<Output = Result<()>>,
{
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group)
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest")
        .create().context("create Kafka graph consumer")?;
    consumer.subscribe(&[GRAPH_REBUILD_TOPIC]).context("subscribe graph rebuild topic")?;

    let mut stream = consumer.stream();
    while let Some(message) = stream.next().await {
        let message = message.context("receive graph rebuild event")?;
        let payload = message.payload().context("graph rebuild event has no payload")?;
        let event: GraphRebuild = serde_json::from_slice(payload).context("decode graph rebuild event")?;
        event.validate()?;
        handle(event).await?;
        consumer.commit_message(&message, CommitMode::Sync).context("commit graph rebuild offset")?;
    }
    Ok(())
}
