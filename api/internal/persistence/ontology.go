package persistence

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

type SemanticClass struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type SemanticProperty struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	DomainClassID int64  `json:"domainClassId"`
	RangeClassID  int64  `json:"rangeClassId"`
	Description   string `json:"description"`
	Domain        string `json:"domain"`
	Range         string `json:"range"`
}

type SemanticIndividual struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	ClassID     int64   `json:"classId"`
	Description string  `json:"description"`
	ExternalID  *string `json:"externalId"`
	Class       string  `json:"class"`
}

type SemanticRelation struct {
	ID         int64  `json:"id"`
	SubjectID  int64  `json:"subjectId"`
	PropertyID int64  `json:"propertyId"`
	ObjectID   int64  `json:"objectId"`
	Subject    string `json:"subject"`
	Predicate  string `json:"predicate"`
	Object     string `json:"object"`
}

type Ontology struct {
	Classes     []SemanticClass      `json:"classes"`
	Properties  []SemanticProperty   `json:"properties"`
	Individuals []SemanticIndividual `json:"individuals"`
	Relations   []SemanticRelation   `json:"relations"`
}

type RebuildOutbox struct {
	EventID string
	Topic   string
	Key     string
	Payload any
}

func (store *Store) ListClasses(ctx context.Context) ([]SemanticClass, error) {
	rows, err := store.pool.Query(ctx, "select id, name, description from semantic_classes order by id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SemanticClass, 0)
	for rows.Next() {
		var item SemanticClass
		if err := rows.Scan(&item.ID, &item.Name, &item.Description); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) ListProperties(ctx context.Context) ([]SemanticProperty, error) {
	rows, err := store.pool.Query(ctx, `select p.id, p.name, p.domain_class_id, p.range_class_id, p.description, d.name, r.name from semantic_properties p join semantic_classes d on d.id=p.domain_class_id join semantic_classes r on r.id=p.range_class_id order by p.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SemanticProperty, 0)
	for rows.Next() {
		var item SemanticProperty
		if err := rows.Scan(&item.ID, &item.Name, &item.DomainClassID, &item.RangeClassID, &item.Description, &item.Domain, &item.Range); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) ListIndividuals(ctx context.Context) ([]SemanticIndividual, error) {
	rows, err := store.pool.Query(ctx, `select i.id, i.name, i.class_id, i.description, i.external_id, c.name from semantic_individuals i join semantic_classes c on c.id=i.class_id order by i.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SemanticIndividual, 0)
	for rows.Next() {
		var item SemanticIndividual
		if err := rows.Scan(&item.ID, &item.Name, &item.ClassID, &item.Description, &item.ExternalID, &item.Class); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) ListRelations(ctx context.Context) ([]SemanticRelation, error) {
	rows, err := store.pool.Query(ctx, `select r.id, r.subject_id, r.property_id, r.object_id, s.name, p.name, o.name from semantic_relations r join semantic_individuals s on s.id=r.subject_id join semantic_properties p on p.id=r.property_id join semantic_individuals o on o.id=r.object_id order by r.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SemanticRelation, 0)
	for rows.Next() {
		var item SemanticRelation
		if err := rows.Scan(&item.ID, &item.SubjectID, &item.PropertyID, &item.ObjectID, &item.Subject, &item.Predicate, &item.Object); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) GetOntology(ctx context.Context) (Ontology, error) {
	classes, err := store.ListClasses(ctx)
	if err != nil {
		return Ontology{}, err
	}
	properties, err := store.ListProperties(ctx)
	if err != nil {
		return Ontology{}, err
	}
	individuals, err := store.ListIndividuals(ctx)
	if err != nil {
		return Ontology{}, err
	}
	relations, err := store.ListRelations(ctx)
	if err != nil {
		return Ontology{}, err
	}
	return Ontology{Classes: classes, Properties: properties, Individuals: individuals, Relations: relations}, nil
}

func insertOutbox(ctx context.Context, tx pgx.Tx, outbox RebuildOutbox) error {
	payload, err := json.Marshal(outbox.Payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into outbox_event (event_id, topic, key, payload) values ($1,$2,$3,$4::jsonb)`, outbox.EventID, outbox.Topic, outbox.Key, payload)
	return err
}

func (store *Store) CreateClass(ctx context.Context, name, description string, outbox RebuildOutbox) (SemanticClass, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return SemanticClass{}, err
	}
	defer tx.Rollback(ctx)
	var item SemanticClass
	err = tx.QueryRow(ctx, `insert into semantic_classes (name, description) values ($1,$2) returning id,name,description`, name, description).Scan(&item.ID, &item.Name, &item.Description)
	if err != nil {
		return item, err
	}
	if err := insertOutbox(ctx, tx, outbox); err != nil {
		return item, err
	}
	return item, tx.Commit(ctx)
}

func (store *Store) CreateProperty(ctx context.Context, name string, domainID, rangeID int64, description string, outbox RebuildOutbox) (SemanticProperty, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return SemanticProperty{}, err
	}
	defer tx.Rollback(ctx)
	var item SemanticProperty
	err = tx.QueryRow(ctx, `insert into semantic_properties (name,domain_class_id,range_class_id,description) values ($1,$2,$3,$4) returning id,name,domain_class_id,range_class_id,description`, name, domainID, rangeID, description).Scan(&item.ID, &item.Name, &item.DomainClassID, &item.RangeClassID, &item.Description)
	if err != nil {
		return item, err
	}
	if err := tx.QueryRow(ctx, `select d.name,r.name from semantic_classes d, semantic_classes r where d.id=$1 and r.id=$2`, domainID, rangeID).Scan(&item.Domain, &item.Range); err != nil {
		return item, err
	}
	if err := insertOutbox(ctx, tx, outbox); err != nil {
		return item, err
	}
	return item, tx.Commit(ctx)
}

func (store *Store) CreateIndividual(ctx context.Context, name string, classID int64, description string, outbox RebuildOutbox) (SemanticIndividual, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return SemanticIndividual{}, err
	}
	defer tx.Rollback(ctx)
	var item SemanticIndividual
	err = tx.QueryRow(ctx, `insert into semantic_individuals (name,class_id,description) values ($1,$2,$3) returning id,name,class_id,description,external_id`, name, classID, description).Scan(&item.ID, &item.Name, &item.ClassID, &item.Description, &item.ExternalID)
	if err != nil {
		return item, err
	}
	if err := tx.QueryRow(ctx, `select name from semantic_classes where id=$1`, classID).Scan(&item.Class); err != nil {
		return item, err
	}
	if err := insertOutbox(ctx, tx, outbox); err != nil {
		return item, err
	}
	return item, tx.Commit(ctx)
}

func (store *Store) CreateRelation(ctx context.Context, subjectID, propertyID, objectID int64, outbox RebuildOutbox) (SemanticRelation, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return SemanticRelation{}, err
	}
	defer tx.Rollback(ctx)
	var item SemanticRelation
	err = tx.QueryRow(ctx, `insert into semantic_relations (subject_id,property_id,object_id) values ($1,$2,$3) returning id,subject_id,property_id,object_id`, subjectID, propertyID, objectID).Scan(&item.ID, &item.SubjectID, &item.PropertyID, &item.ObjectID)
	if err != nil {
		return item, err
	}
	if err := tx.QueryRow(ctx, `select s.name,p.name,o.name from semantic_individuals s, semantic_properties p, semantic_individuals o where s.id=$1 and p.id=$2 and o.id=$3`, subjectID, propertyID, objectID).Scan(&item.Subject, &item.Predicate, &item.Object); err != nil {
		return item, err
	}
	if err := insertOutbox(ctx, tx, outbox); err != nil {
		return item, err
	}
	return item, tx.Commit(ctx)
}

func (store *Store) EnqueueOutbox(ctx context.Context, outbox RebuildOutbox) error {
	payload, err := json.Marshal(outbox.Payload)
	if err != nil {
		return err
	}
	_, err = store.pool.Exec(ctx, `insert into outbox_event (event_id,topic,key,payload) values ($1,$2,$3,$4::jsonb)`, outbox.EventID, outbox.Topic, outbox.Key, payload)
	return err
}
