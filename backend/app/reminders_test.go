package app

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/selfhostit/flowy/cycle"
	_ "github.com/selfhostit/flowy/migrations"
	"github.com/selfhostit/flowy/push"
)

func TestReminders(t *testing.T) {
	f := cycle.Forecast{NextStart: 100, Ovulations: []cycle.Day{86, 114}}
	cases := []struct {
		name            string
		now             cycle.Day
		period, fertile bool
		want            []string
	}{
		{"period in 2 days", 98, true, true, []string{"period"}},
		{"not when turned off", 98, false, true, nil},
		{"fertile window starts", 81, true, true, []string{"fertile"}},
		{"next cycle's fertile window", 109, false, true, []string{"fertile"}},
		{"nothing on other days", 90, true, true, nil},
	}
	for _, c := range cases {
		var got []string
		for _, m := range reminders(f, c.now, c.period, c.fertile) {
			got = append(got, m.Tag)
		}
		if len(got) != len(c.want) || (len(got) > 0 && got[0] != c.want[0]) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

// The jobs' queries run against a real database without errors.
func TestReminderJobs(t *testing.T) {
	a, err := tests.NewTestAppWithConfig(core.BaseAppConfig{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cleanup()
	users, _ := a.FindCollectionByNameOrId("users")
	u := core.NewRecord(users)
	u.SetEmail("alice@example.com")
	u.SetPassword("password123")
	u.Set("remind_period", true)
	u.Set("remind_pill", true)
	if err := a.Save(u); err != nil {
		t.Fatal(err)
	}
	days, _ := a.FindCollectionByNameOrId("days")
	d := core.NewRecord(days)
	d.Set("user", u.Id)
	d.Set("date", "2026-10-01")
	d.Set("flow", "heavy")
	if err := a.Save(d); err != nil {
		t.Fatal(err)
	}

	now, _ := cycle.Parse("2026-10-27")
	if err := sendReminders(a, now); err != nil {
		t.Error(err)
	}
	if err := sendPillReminders(a, now); err != nil {
		t.Error(err)
	}
}

func TestDiscreetReminders(t *testing.T) {
	a, err := tests.NewTestAppWithConfig(core.BaseAppConfig{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cleanup()
	users, _ := a.FindCollectionByNameOrId("users")
	u := core.NewRecord(users)
	msg := push.Message{Title: "Your period is coming", Body: "It's expected in 2 days.", URL: "/#today", Tag: "period"}
	if got := discreetIf(u, msg); got != msg {
		t.Errorf("off: got %+v, want it unchanged", got)
	}
	u.Set("discreet_reminders", true)
	got := discreetIf(u, msg)
	if got.Title != "Reminder from Flowy" || got.Body != "Open Flowy to see it." {
		t.Errorf("on: got %q / %q", got.Title, got.Body)
	}
	if got.URL != msg.URL || got.Tag != msg.Tag {
		t.Errorf("on: URL and tag should stay, got %+v", got)
	}
}
