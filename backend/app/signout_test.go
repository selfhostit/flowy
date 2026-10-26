package app_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/selfhostit/flowy/push"
)

func TestSignOutEverywhere(t *testing.T) {
	a := newApp(t)
	alice, aliceToken := addUser(t, a, "alice@example.com", "member")
	bob, bobToken := addUser(t, a, "bob@example.com", "member")
	subs, err := a.FindCollectionByNameOrId(push.Collection)
	if err != nil {
		t.Fatal(err)
	}
	for _, u := range []*core.Record{alice, bob} {
		s := core.NewRecord(subs)
		s.Set("user", u.Id)
		s.Set("endpoint", "https://push.example.com/"+u.Id)
		s.Set("p256dh", "key")
		s.Set("auth", "auth")
		if err := a.Save(s); err != nil {
			t.Fatal(err)
		}
	}
	defer a.Cleanup()
	// the scenarios share the app, so each one sees what the last one did
	app := func(testing.TB) *tests.TestApp { return a }

	(&tests.ApiScenario{
		Name:                  "signed-out visitors cannot",
		Method:                http.MethodPost,
		URL:                   "/api/app/signout-everywhere",
		ExpectedStatus:        http.StatusUnauthorized,
		ExpectedContent:       []string{`"status":401`},
		TestAppFactory:        app,
		DisableTestAppCleanup: true,
	}).Test(t)

	(&tests.ApiScenario{
		Name:                  "alice signs out everywhere",
		Method:                http.MethodPost,
		URL:                   "/api/app/signout-everywhere",
		Headers:               map[string]string{"Authorization": aliceToken},
		ExpectedStatus:        http.StatusNoContent,
		TestAppFactory:        app,
		DisableTestAppCleanup: true,
		AfterTestFunc: func(t testing.TB, a *tests.TestApp, _ *http.Response) {
			left, err := a.FindAllRecords(push.Collection)
			if err != nil {
				t.Fatal(err)
			}
			if len(left) != 1 || left[0].GetString("user") != bob.Id {
				t.Errorf("notifications left = %v, want only bob's", left)
			}
		},
	}).Test(t)

	for name, sc := range map[string]struct {
		token, content string
		status         int
	}{
		"alice's old token no longer works": {aliceToken, `"status":401`, http.StatusUnauthorized},
		"bob stays signed in":               {bobToken, `"token":`, http.StatusOK},
	} {
		(&tests.ApiScenario{
			Name:                  name,
			Method:                http.MethodPost,
			URL:                   "/api/collections/users/auth-refresh",
			Headers:               map[string]string{"Authorization": sc.token},
			ExpectedStatus:        sc.status,
			ExpectedContent:       []string{sc.content},
			TestAppFactory:        app,
			DisableTestAppCleanup: true,
		}).Test(t)
	}
}
