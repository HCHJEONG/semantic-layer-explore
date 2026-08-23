package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"semantic-layer-explore/api/internal/persistence"
)

type ruleCondition struct {
	SensorID string `json:"sensorId"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
	Unit     string `json:"unit"`
}
type ruleAction struct {
	DeviceID string   `json:"deviceId"`
	Command  string   `json:"command"`
	Value    *float64 `json:"value,omitempty"`
}
type ruleInput struct {
	Name            string        `json:"name"`
	Description     string        `json:"description"`
	Condition       ruleCondition `json:"condition"`
	Action          ruleAction    `json:"action"`
	Enabled         *bool         `json:"enabled"`
	CooldownSeconds *int          `json:"cooldownSeconds"`
}
type commandInput struct {
	Command string   `json:"command"`
	Value   *float64 `json:"value,omitempty"`
}

func (r *Router) sensors(w http.ResponseWriter, req *http.Request) {
	items, err := r.store.ListSensors(req.Context())
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "sensors unavailable"})
		return
	}
	writeJSON(w, 200, items)
}

func (r *Router) operationsState(w http.ResponseWriter, req *http.Request) {
	sensors, err := r.store.ListSensors(req.Context())
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "state unavailable"})
		return
	}
	devices, err := r.store.ListDevices(req.Context())
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "state unavailable"})
		return
	}
	for i := range devices {
		devices[i].CommandMaxPublishAttempts = r.cfg.CommandMaxPublishAttempts
	}
	definitions := make([]map[string]any, 0, len(sensors))
	readings := make([]any, 0, len(sensors))
	for _, sensor := range sensors {
		definitions = append(definitions, map[string]any{"id": sensor.ID, "name": sensor.Name, "type": sensor.Type, "unit": sensor.Unit})
		if sensor.LatestReading != nil {
			readings = append(readings, sensor.LatestReading)
		}
	}
	writeJSON(w, 200, map[string]any{"mode": "simulator", "connection": map[string]any{"state": "connected", "adapter": "mqtt"}, "simulator": map[string]any{"running": true, "scenario": "normal", "intervalMs": 0}, "sensors": definitions, "readings": readings, "devices": devices})
}
func (r *Router) devices(w http.ResponseWriter, req *http.Request) {
	items, err := r.store.ListDevices(req.Context())
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "devices unavailable"})
		return
	}
	for i := range items {
		items[i].CommandMaxPublishAttempts = r.cfg.CommandMaxPublishAttempts
	}
	writeJSON(w, 200, items)
}

func randomID(prefix string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(b), nil
}

func ruleMaps(input ruleInput) (map[string]any, map[string]any) {
	condition := map[string]any{"sensorId": strings.TrimSpace(input.Condition.SensorID), "operator": input.Condition.Operator, "value": input.Condition.Value, "unit": input.Condition.Unit}
	action := map[string]any{"deviceId": strings.TrimSpace(input.Action.DeviceID), "command": input.Action.Command}
	if input.Action.Value != nil {
		action["value"] = *input.Action.Value
	}
	return condition, action
}
func mapRuleInput(input ruleInput, current *persistence.Rule) (persistence.Rule, error) {
	item := persistence.Rule{}
	if current != nil {
		item = *current
	}
	item.Name = strings.TrimSpace(input.Name)
	item.Description = strings.TrimSpace(input.Description)
	item.Condition, item.Action = ruleMaps(input)
	item.Enabled = true
	if input.Enabled != nil {
		item.Enabled = *input.Enabled
	}
	item.CooldownSeconds = 10
	if input.CooldownSeconds != nil {
		item.CooldownSeconds = *input.CooldownSeconds
	}
	return item, nil
}

func (r *Router) validateRule(req *http.Request, input ruleInput) error {
	if !validText(input.Name, 100) || len([]rune(strings.TrimSpace(input.Description))) > 500 || input.Condition.SensorID == "" || input.Action.DeviceID == "" {
		return errInvalidInput
	}
	if input.CooldownSeconds != nil && (*input.CooldownSeconds < 0 || *input.CooldownSeconds > 86400) {
		return errInvalidInput
	}
	if !oneOf(input.Condition.Operator, "gt", "gte", "lt", "lte", "eq") || !oneOf(input.Condition.Unit, "celsius", "lux", "centimeter", "boolean") || !oneOf(input.Action.Command, "on", "off", "set-angle", "beep") {
		return errInvalidInput
	}
	sensors, err := r.store.ListSensors(req.Context())
	if err != nil {
		return err
	}
	var sensor *persistence.Sensor
	for i := range sensors {
		if sensors[i].ID == input.Condition.SensorID {
			sensor = &sensors[i]
			break
		}
	}
	if sensor == nil || sensor.Unit != input.Condition.Unit {
		return errInvalidInput
	}
	device, err := r.store.GetDevice(req.Context(), input.Action.DeviceID)
	if err != nil {
		return errInvalidInput
	}
	allowed := map[string][]string{"led": {"on", "off"}, "relay": {"on", "off"}, "servo": {"set-angle", "off"}, "buzzer": {"beep", "off"}}
	if !oneOf(input.Action.Command, allowed[device.Type]...) {
		return errInvalidInput
	}
	if input.Action.Command == "set-angle" && (input.Action.Value == nil || *input.Action.Value < 0 || *input.Action.Value > 180) {
		return errInvalidInput
	}
	return nil
}

var errInvalidInput = &inputError{}

type inputError struct{}

func (*inputError) Error() string { return "Invalid input" }
func oneOf(value string, values ...string) bool {
	for _, candidate := range values {
		if value == candidate {
			return true
		}
	}
	return false
}

func (r *Router) rules(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodGet {
		items, err := r.store.ListRules(req.Context())
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "rules unavailable"})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	var input ruleInput
	if decodeInput(req, &input) != nil || r.validateRule(req, input) != nil {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	id, err := randomID("rule-")
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create rule id"})
		return
	}
	item, _ := mapRuleInput(input, nil)
	item.ID = id
	created, err := r.store.CreateRule(req.Context(), item)
	if err != nil {
		r.mutationError(w, err)
		return
	}
	writeJSON(w, 201, created)
}

func ruleToInput(item persistence.Rule) ruleInput {
	body, _ := json.Marshal(map[string]any{"name": item.Name, "description": item.Description, "condition": item.Condition, "action": item.Action, "enabled": item.Enabled, "cooldownSeconds": item.CooldownSeconds})
	var input ruleInput
	_ = json.Unmarshal(body, &input)
	return input
}
func (r *Router) rule(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("ruleId")
	current, err := r.store.GetRule(req.Context(), id)
	if err == pgx.ErrNoRows {
		writeJSON(w, 404, map[string]string{"error": "Rule not found"})
		return
	}
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "rule unavailable"})
		return
	}
	if req.Method == http.MethodGet {
		writeJSON(w, 200, current)
		return
	}
	if req.Method == http.MethodDelete {
		deleted, err := r.store.DeleteRule(req.Context(), id)
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "rule deletion unavailable"})
			return
		}
		if !deleted {
			writeJSON(w, 404, map[string]string{"error": "Rule not found"})
			return
		}
		w.WriteHeader(204)
		return
	}
	var patch map[string]json.RawMessage
	if decodeInput(req, &patch) != nil || len(patch) == 0 {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	base := ruleToInput(current)
	body, _ := json.Marshal(base)
	var merged map[string]json.RawMessage
	_ = json.Unmarshal(body, &merged)
	for key, value := range patch {
		if _, ok := merged[key]; !ok {
			writeJSON(w, 400, map[string]string{"error": "Invalid input"})
			return
		}
		merged[key] = value
	}
	body, _ = json.Marshal(merged)
	var input ruleInput
	if json.Unmarshal(body, &input) != nil || r.validateRule(req, input) != nil {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	item, _ := mapRuleInput(input, &current)
	updated, err := r.store.UpdateRule(req.Context(), item)
	if err != nil {
		r.mutationError(w, err)
		return
	}
	writeJSON(w, 200, updated)
}

func (r *Router) setRuleEnabled(w http.ResponseWriter, req *http.Request, enabled bool) {
	item, err := r.store.SetRuleEnabled(req.Context(), req.PathValue("ruleId"), enabled)
	if err == pgx.ErrNoRows {
		writeJSON(w, 404, map[string]string{"error": "Rule not found"})
		return
	}
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "rule update unavailable"})
		return
	}
	writeJSON(w, 200, item)
}
func (r *Router) enableRule(w http.ResponseWriter, req *http.Request) { r.setRuleEnabled(w, req, true) }
func (r *Router) disableRule(w http.ResponseWriter, req *http.Request) {
	r.setRuleEnabled(w, req, false)
}

func (r *Router) deviceCommand(w http.ResponseWriter, req *http.Request) {
	var input commandInput
	if decodeInput(req, &input) != nil {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	device, err := r.store.GetDevice(req.Context(), req.PathValue("deviceId"))
	if err == pgx.ErrNoRows {
		writeJSON(w, 404, map[string]string{"error": "Device not found"})
		return
	}
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "device unavailable"})
		return
	}
	allowed := map[string][]string{"led": {"on", "off"}, "relay": {"on", "off"}, "servo": {"set-angle", "off"}, "buzzer": {"beep", "off"}}
	if !oneOf(input.Command, allowed[device.Type]...) {
		writeJSON(w, 400, map[string]string{"error": "Invalid input"})
		return
	}
	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339Nano)
	if input.Command == "set-angle" {
		if input.Value == nil || *input.Value < 0 || *input.Value > 180 {
			writeJSON(w, 400, map[string]string{"error": "Invalid input"})
			return
		}
	}
	eventID, idErr := randomID("device-command:user:")
	if idErr != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create command id"})
		return
	}
	command := map[string]any{"schemaVersion": "command.v1", "commandId": eventID, "deviceId": device.ID, "command": input.Command, "issuedBy": "user", "issuedAt": now}
	if input.Value != nil {
		command["value"] = *input.Value
	}
	if err := r.store.CreateDeviceCommand(req.Context(), eventID, device.ID, command, nowTime); err != nil {
		writeJSON(w, 503, map[string]string{"error": "device command unavailable"})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "queued", "commandId": eventID, "deviceId": device.ID})
}
