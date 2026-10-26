package app

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/selfhostit/flowy/cycle"
	"github.com/selfhostit/flowy/jobs"
	"github.com/selfhostit/flowy/push"
)

// registerReminders sends each morning's period and fertile-window reminders,
// and the evening pill reminder, to the people who turned them on in Settings.
func registerReminders(app core.App) {
	jobs.MustAdd(app, "reminders", "0 9 * * *", func(app core.App) error {
		return sendReminders(app, cycle.Of(time.Now()))
	})
	jobs.MustAdd(app, "pill-reminder", "0 21 * * *", func(app core.App) error {
		return sendPillReminders(app, cycle.Of(time.Now()))
	})
}

// sendPillReminders reminds people who haven't logged their pill today.
func sendPillReminders(app core.App, now cycle.Day) error {
	users, err := app.FindRecordsByFilter("users", "remind_pill = true", "", 0, 0)
	if err != nil {
		return err
	}
	date := time.Unix(int64(now)*86400, 0).UTC().Format(time.DateOnly)
	for _, u := range users {
		taken, err := app.FindRecordsByFilter("days", "user = {:user} && date = {:date} && pill = true",
			"", 1, 0, dbx.Params{"user": u.Id, "date": date})
		if err != nil {
			return err
		}
		if len(taken) == 0 {
			push.ToUser(app, u.Id, push.Message{
				Title: "Time for your pill",
				Body:  "Tap to log it once you've taken it.",
				URL:   "/#today",
				Tag:   "pill",
			})
		}
	}
	return nil
}

func sendReminders(app core.App, now cycle.Day) error {
	users, err := app.FindRecordsByFilter("users", "remind_period = true || remind_fertile = true", "", 0, 0)
	if err != nil {
		return err
	}
	for _, u := range users {
		bleeding, temps, err := loggedCycle(app, u, now)
		if err != nil {
			return err
		}
		f, ok := cycle.Predict(bleeding, temps, settingsOf(u), now)
		if !ok {
			continue
		}
		for _, msg := range reminders(f, now, u.GetBool("remind_period"), u.GetBool("remind_fertile")) {
			push.ToUser(app, u.Id, msg)
		}
	}
	return nil
}

// loggedCycle is what the cycle math needs from someone's days up to now: the
// days with bleeding and the temperatures.
func loggedCycle(app core.App, u *core.Record, now cycle.Day) (bleeding []cycle.Day, temps []cycle.Temp, err error) {
	days, err := app.FindRecordsByFilter("days",
		"user = {:user} && (flow = 'light' || flow = 'medium' || flow = 'heavy' || temperature > 0)", "", 0, 0,
		dbx.Params{"user": u.Id})
	if err != nil {
		return nil, nil, err
	}
	for _, d := range days {
		day, err := cycle.Parse(d.GetString("date"))
		if err != nil || day > now {
			continue
		}
		if f := d.GetString("flow"); f == "light" || f == "medium" || f == "heavy" {
			bleeding = append(bleeding, day)
		}
		if t := d.GetFloat("temperature"); t > 0 {
			temps = append(temps, cycle.Temp{Day: day, Celsius: t})
		}
	}
	return bleeding, temps, nil
}

func settingsOf(u *core.Record) cycle.Settings {
	s := cycle.Defaults
	if v := u.GetInt("cycle_length"); v > 0 {
		s.CycleLength = v
	}
	if v := u.GetInt("period_length"); v > 0 {
		s.PeriodLength = v
	}
	if v := u.GetInt("luteal_length"); v > 0 {
		s.LutealLength = v
	}
	return s
}

// reminders are the notifications due today.
func reminders(f cycle.Forecast, now cycle.Day, period, fertile bool) []push.Message {
	var out []push.Message
	if period && !f.InPeriod && f.NextStart-now == 2 {
		out = append(out, push.Message{
			Title: "Your period is coming",
			Body:  "It's expected in 2 days.",
			Tag:   "period",
		})
	}
	if fertile {
		for _, o := range f.Ovulations {
			if o-5 == now {
				out = append(out, push.Message{
					Title: "Your fertile window starts today",
					Body:  "Ovulation is expected in 5 days.",
					Tag:   "fertile",
				})
			}
		}
	}
	return out
}
