package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

type classInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
type propertyInput struct {
	Name          string `json:"name"`
	DomainClassID int64  `json:"domainClassId"`
	RangeClassID  int64  `json:"rangeClassId"`
	Description   string `json:"description"`
}
type individualInput struct {
	Name        string `json:"name"`
	ClassID     int64  `json:"classId"`
	Description string `json:"description"`
}
type relationInput struct {
	SubjectID  int64 `json:"subjectId"`
	PropertyID int64 `json:"propertyId"`
	ObjectID   int64 `json:"objectId"`
}

func decodeInput(req *http.Request, target any) error {
	defer req.Body.Close()
	decoder := json.NewDecoder(req.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func validText(value string, max int) bool {
	length := len([]rune(strings.TrimSpace(value)))
	return length > 0 && length <= max
}

func (r *Router) mutationError(w http.ResponseWriter, err error) {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && (postgresError.Code == "23503" || postgresError.Code == "23505") {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "ontology constraint conflict"})
		return
	}
	r.logger.Error("ontology mutation failed", "error", err)
	writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "ontology mutation unavailable"})
}

func (r *Router) semanticClasses(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodGet {
		items, err := r.store.ListClasses(req.Context())
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "classes unavailable"})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	var input classInput
	if decodeInput(req, &input) != nil || !validText(input.Name, 60) || !validText(input.Description, 240) {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	event, err := newGraphRebuild()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create rebuild id"})
		return
	}
	item, err := r.store.CreateClass(req.Context(), strings.TrimSpace(input.Name), strings.TrimSpace(input.Description), r.rebuildOutbox(event))
	if err != nil {
		r.mutationError(w, err)
		return
	}
	writeJSON(w, 201, item)
}

func (r *Router) semanticProperties(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodGet {
		items, err := r.store.ListProperties(req.Context())
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "properties unavailable"})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	var input propertyInput
	if decodeInput(req, &input) != nil || !validText(input.Name, 60) || !validText(input.Description, 240) || input.DomainClassID < 1 || input.RangeClassID < 1 {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	event, err := newGraphRebuild()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create rebuild id"})
		return
	}
	item, err := r.store.CreateProperty(req.Context(), strings.TrimSpace(input.Name), input.DomainClassID, input.RangeClassID, strings.TrimSpace(input.Description), r.rebuildOutbox(event))
	if err != nil {
		r.mutationError(w, err)
		return
	}
	writeJSON(w, 201, item)
}

func (r *Router) semanticIndividuals(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodGet {
		items, err := r.store.ListIndividuals(req.Context())
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "individuals unavailable"})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	var input individualInput
	if decodeInput(req, &input) != nil || !validText(input.Name, 60) || !validText(input.Description, 240) || input.ClassID < 1 {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	event, err := newGraphRebuild()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create rebuild id"})
		return
	}
	item, err := r.store.CreateIndividual(req.Context(), strings.TrimSpace(input.Name), input.ClassID, strings.TrimSpace(input.Description), r.rebuildOutbox(event))
	if err != nil {
		r.mutationError(w, err)
		return
	}
	writeJSON(w, 201, item)
}

func (r *Router) semanticRelations(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodGet {
		items, err := r.store.ListRelations(req.Context())
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "relations unavailable"})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	var input relationInput
	if decodeInput(req, &input) != nil || input.SubjectID < 1 || input.PropertyID < 1 || input.ObjectID < 1 {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	event, err := newGraphRebuild()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create rebuild id"})
		return
	}
	item, err := r.store.CreateRelation(req.Context(), input.SubjectID, input.PropertyID, input.ObjectID, r.rebuildOutbox(event))
	if err != nil {
		r.mutationError(w, err)
		return
	}
	writeJSON(w, 201, item)
}

func (r *Router) semanticOntology(w http.ResponseWriter, req *http.Request) {
	ontology, err := r.store.GetOntology(req.Context())
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "ontology unavailable"})
		return
	}
	writeJSON(w, 200, ontology)
}
