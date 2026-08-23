package graph

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	endpoint, user, password string
	http                     *http.Client
}

type Node struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	ClassName  string `json:"className,omitempty"`
	ExternalID string `json:"externalId,omitempty"`
}
type Relation struct {
	ID        int64  `json:"id"`
	SubjectID string `json:"subjectId"`
	Predicate string `json:"predicate"`
	ObjectID  string `json:"objectId"`
}
type Ontology struct {
	Nodes     []Node     `json:"nodes"`
	Relations []Relation `json:"relations"`
}

func NewClient(endpoint, user, password string) *Client {
	return &Client{endpoint: endpoint, user: user, password: password, http: &http.Client{Timeout: 5 * time.Second}}
}

func (c *Client) Ontology(ctx context.Context) (Ontology, error) {
	body := map[string]any{"statements": []any{
		map[string]any{"statement": "MATCH (n:SemanticEntity) RETURN n.id, n.kind, n.name, coalesce(n.className, ''), coalesce(n.externalId, '') ORDER BY n.kind, n.name LIMIT 200", "resultDataContents": []string{"row"}},
		map[string]any{"statement": "MATCH (s:SemanticEntity)-[r:SEMANTIC_RELATION]->(o:SemanticEntity) RETURN r.id, s.id, r.predicate, o.id ORDER BY r.id LIMIT 300", "resultDataContents": []string{"row"}},
	}}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(payload))
	if err != nil {
		return Ontology{}, err
	}
	req.Header.Set("content-type", "application/json")
	req.SetBasicAuth(c.user, c.password)
	response, err := c.http.Do(req)
	if err != nil {
		return Ontology{}, err
	}
	defer response.Body.Close()
	if response.StatusCode/100 != 2 {
		return Ontology{}, fmt.Errorf("Neo4j returned %s", response.Status)
	}
	var decoded struct {
		Results []struct {
			Data []struct {
				Row []any `json:"row"`
			} `json:"data"`
		} `json:"results"`
		Errors []any `json:"errors"`
	}
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return Ontology{}, err
	}
	if len(decoded.Errors) > 0 || len(decoded.Results) != 2 {
		return Ontology{}, fmt.Errorf("Neo4j query failed")
	}
	ontology := Ontology{Nodes: []Node{}, Relations: []Relation{}}
	for _, data := range decoded.Results[0].Data {
		row := data.Row
		ontology.Nodes = append(ontology.Nodes, Node{ID: fmt.Sprint(row[0]), Kind: fmt.Sprint(row[1]), Name: fmt.Sprint(row[2]), ClassName: fmt.Sprint(row[3]), ExternalID: fmt.Sprint(row[4])})
	}
	for _, data := range decoded.Results[1].Data {
		row := data.Row
		ontology.Relations = append(ontology.Relations, Relation{ID: int64(row[0].(float64)), SubjectID: fmt.Sprint(row[1]), Predicate: fmt.Sprint(row[2]), ObjectID: fmt.Sprint(row[3])})
	}
	return ontology, nil
}
