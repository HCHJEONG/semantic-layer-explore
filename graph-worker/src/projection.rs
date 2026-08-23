use anyhow::{Context, Result};
use serde::Serialize;
use tokio_postgres::Client;

use crate::{consumer::GraphRebuild, neo4j::Neo4jClient};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticNode {
    id: String,
    kind: &'static str,
    name: String,
    description: String,
    class_name: Option<String>,
    external_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticRelation { id: i64, subject_id: String, predicate: String, object_id: String }

pub async fn rebuild(postgres: &Client, neo4j: &Neo4jClient, event: &GraphRebuild) -> Result<()> {
    postgres.execute(
        "update graph_projection_status set status='running', rebuild_id=$1, requested_at=$2::text::timestamptz, started_at=now(), completed_at=null, error_message=null, updated_at=now() where projection_name='ontology'",
        &[&event.rebuild_id, &event.requested_at],
    ).await.context("mark projection running")?;

    match project(postgres, neo4j).await {
        Ok((nodes, relations)) => {
            postgres.execute(
                "update graph_projection_status set status='ready', completed_at=now(), node_count=$1, relation_count=$2, error_message=null, updated_at=now() where projection_name='ontology'",
                &[&nodes, &relations],
            ).await.context("mark projection ready")?;
            Ok(())
        }
        Err(error) => {
            let message = error.to_string();
            let _ = postgres.execute("update graph_projection_status set status='failed', completed_at=now(), error_message=$1, updated_at=now() where projection_name='ontology'", &[&message]).await;
            Err(error)
        }
    }
}

async fn project(postgres: &Client, neo4j: &Neo4jClient) -> Result<(i32, i32)> {
    let mut nodes = Vec::new();
    for row in postgres.query("select id, name, description from semantic_classes order by id", &[]).await? {
        let id: i64 = row.get(0);
        nodes.push(SemanticNode { id: format!("Class:{id}"), kind: "Class", name: row.get(1), description: row.get(2), class_name: None, external_id: None });
    }
    for row in postgres.query("select p.id, p.name, p.description, d.name || ' -> ' || r.name from semantic_properties p join semantic_classes d on d.id=p.domain_class_id join semantic_classes r on r.id=p.range_class_id order by p.id", &[]).await? {
        let id: i64 = row.get(0);
        nodes.push(SemanticNode { id: format!("Property:{id}"), kind: "Property", name: row.get(1), description: row.get(2), class_name: Some(row.get(3)), external_id: None });
    }
    for row in postgres.query("select i.id, i.name, i.description, c.name, i.external_id from semantic_individuals i join semantic_classes c on c.id=i.class_id order by i.id", &[]).await? {
        let id: i64 = row.get(0);
        nodes.push(SemanticNode { id: format!("Individual:{id}"), kind: "Individual", name: row.get(1), description: row.get(2), class_name: Some(row.get(3)), external_id: row.get(4) });
    }
    let relations = postgres.query("select r.id, r.subject_id, p.name, r.object_id from semantic_relations r join semantic_properties p on p.id=r.property_id order by r.id", &[]).await?
        .into_iter().map(|row| {
            let subject_id: i64 = row.get(1);
            let object_id: i64 = row.get(3);
            SemanticRelation { id: row.get(0), subject_id: format!("Individual:{subject_id}"), predicate: row.get(2), object_id: format!("Individual:{object_id}") }
        }).collect::<Vec<_>>();
    neo4j.replace_projection(&nodes, &relations).await?;
    Ok((nodes.len() as i32, relations.len() as i32))
}
