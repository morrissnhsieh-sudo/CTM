package cpm

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/ctm/pm-service/internal/repository"
)

var predRegex = regexp.MustCompile(`^([0-9]+)(FS|SS|FF|SF)?(?:([+-])([0-9]+))?$`)

// ParsePredecessorString parses a custom predecessors string (e.g., "3FS+2,5SS-1")
// into a slice of repository.Dependency structs.
func ParsePredecessorString(input string, toTaskID string, indexToUUID map[int]string) ([]*repository.Dependency, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, nil
	}

	tokens := strings.Split(input, ",")
	var deps []*repository.Dependency

	for _, token := range tokens {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}

		matches := predRegex.FindStringSubmatch(token)
		if matches == nil {
			return nil, fmt.Errorf("invalid predecessor format: %q", token)
		}

		// 1. Predecessor Index
		idx, err := strconv.Atoi(matches[1])
		if err != nil {
			return nil, fmt.Errorf("invalid predecessor index in %q: %w", token, err)
		}

		fromUUID, ok := indexToUUID[idx]
		if !ok {
			return nil, fmt.Errorf("predecessor index %d not found", idx)
		}

		// 2. Dependency Type (default is FS)
		depType := matches[2]
		if depType == "" {
			depType = "FS"
		}

		// 3. Lag Days
		lagDays := 0
		if matches[3] != "" && matches[4] != "" {
			val, err := strconv.Atoi(matches[4])
			if err != nil {
				return nil, fmt.Errorf("invalid lag value in %q: %w", token, err)
			}
			if matches[3] == "-" {
				lagDays = -val
			} else {
				lagDays = val
			}
		}

		deps = append(deps, &repository.Dependency{
			FromTaskID:     fromUUID,
			ToTaskID:       toTaskID,
			DependencyType: depType,
			LagDays:        lagDays,
		})
	}

	return deps, nil
}
