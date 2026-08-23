package mqtt

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"unicode"

	"semantic-layer-explore/api/internal/config"
)

const maxPortableClientIDLength = 23

func resolveClientID(cfg config.Config) (string, string, error) {
	instanceID := strings.TrimSpace(cfg.MQTTInstanceID)
	if instanceID == "" {
		var err error
		instanceID, err = os.Hostname()
		if err != nil || strings.TrimSpace(instanceID) == "" {
			return "", "", errors.New("MQTT instance identity is unavailable")
		}
	}

	if explicit := strings.TrimSpace(cfg.MQTTClientID); explicit != "" {
		if !isPortableClientID(explicit) {
			return "", instanceID, fmt.Errorf("MQTT_CLIENT_ID must contain 1-%d ASCII letters or digits", maxPortableClientIDLength)
		}
		return explicit, instanceID, nil
	}

	prefix := portablePrefix(cfg.MQTTClientIDPrefix)
	if prefix == "" {
		return "", instanceID, errors.New("MQTT_CLIENT_ID_PREFIX must contain an ASCII letter or digit")
	}
	digest := sha256.Sum256([]byte(instanceID))
	clientID := prefix + hex.EncodeToString(digest[:])[:12]
	return clientID, instanceID, nil
}

func portablePrefix(value string) string {
	var builder strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		if r <= unicode.MaxASCII && ((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
			builder.WriteRune(r)
			if builder.Len() == 10 {
				break
			}
		}
	}
	return builder.String()
}

func isPortableClientID(value string) bool {
	if len(value) == 0 || len(value) > maxPortableClientIDLength {
		return false
	}
	for _, r := range value {
		if r > unicode.MaxASCII || !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

func sharedSubscription(group, topic string) (string, error) {
	group = strings.TrimSpace(group)
	topic = strings.TrimSpace(topic)
	if group == "" || strings.ContainsAny(group, "/+#") {
		return "", errors.New("MQTT shared subscription group must not be empty or contain '/', '+', or '#'")
	}
	if topic == "" || strings.HasPrefix(topic, "$share/") {
		return "", errors.New("MQTT shared subscription topic must be a non-shared topic filter")
	}
	return "$share/" + group + "/" + topic, nil
}
