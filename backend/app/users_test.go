package app_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

func TestUserSettingsArePrivate(t *testing.T) {
	cases := []struct {
		name, as, url        string
		expected, unexpected []string
	}{
		{
			name: "people see their own settings", as: "alice", url: "/api/collections/users/records/{alice}",
			expected: []string{`"cycle_length":30`, `"remind_pill":true`},
		},
		{
			name: "others don't see them", as: "bob", url: "/api/collections/users/records/{alice}",
			expected:   []string{`"role":"owner"`},
			unexpected: []string{"cycle_length", "period_length", "luteal_length", "remind_pill", "remind_fertile", "remind_period", "discreet_reminders"},
		},
		{
			name: "nor in a list", as: "bob", url: "/api/collections/users/records",
			expected:   []string{`"totalItems":2`},
			unexpected: []string{`"cycle_length":30`, `"remind_pill":true`},
		},
	}

	for _, c := range cases {
		a := newApp(t)
		alice, aliceToken := addUser(t, a, "alice@example.com", "owner")
		_, bobToken := addUser(t, a, "bob@example.com", "member")
		alice.Set("cycle_length", 30)
		alice.Set("remind_pill", true)
		if err := a.Save(alice); err != nil {
			t.Fatal(err)
		}
		token := aliceToken
		if c.as == "bob" {
			token = bobToken
		}
		url := c.url
		if url == "/api/collections/users/records/{alice}" {
			url = "/api/collections/users/records/" + alice.Id
		}
		(&tests.ApiScenario{
			Name:               c.name,
			Method:             http.MethodGet,
			URL:                url,
			Headers:            map[string]string{"Authorization": token},
			ExpectedStatus:     http.StatusOK,
			ExpectedContent:    c.expected,
			NotExpectedContent: c.unexpected,
			TestAppFactory:     func(testing.TB) *tests.TestApp { return a },
		}).Test(t)
	}
}
