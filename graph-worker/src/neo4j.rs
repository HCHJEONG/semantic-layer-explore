use anyhow::{Context, Result};
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};

pub struct Neo4jClient { client: Client, endpoint: String, user: String, password: String }

impl Neo4jClient {
    pub fn new(endpoint: String, user: String, password: String) -> Self {
        Self { client: Client::new(), endpoint, user, password }
    }

    pub async fn replace_projection<N: Serialize, R: Serialize>(&self, nodes: &[N], relations: &[R]) -> Result<()> {
        let body = json!({ "statements": [
            { "statement": "MATCH (n:SemanticEntity) DETACH DELETE n" },
            { "statement": "UNWIND $nodes AS node CREATE (:SemanticEntity {id: node.id, kind: node.kind, name: node.name, description: node.description, className: node.className, externalId: node.externalId})", "parameters": { "nodes": nodes } },
            { "statement": "UNWIND $relations AS relation MATCH (subject:SemanticEntity {id: relation.subjectId}), (object:SemanticEntity {id: relation.objectId}) CREATE (subject)-[:SEMANTIC_RELATION {id: relation.id, predicate: relation.predicate}]->(object)", "parameters": { "relations": relations } }
        ]});
        let response = self.client.post(&self.endpoint).basic_auth(&self.user, Some(&self.password)).json(&body).send().await.context("send Neo4j projection transaction")?.error_for_status().context("Neo4j projection HTTP status")?;
        let response: Value = response.json().await.context("decode Neo4j projection response")?;
        let errors = response.get("errors").and_then(Value::as_array).context("Neo4j response missing errors")?;
        anyhow::ensure!(errors.is_empty(), "Neo4j projection failed: {}", Value::Array(errors.clone()));
        Ok(())
    }
}
