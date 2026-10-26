package app

import (
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/selfhostit/flowy/cycle"
)

// What a partner sees with someone's share link: where they are in their cycle
// and what's coming, never their history or notes. With show_log, also the
// moods and symptoms logged today.
type partnerView struct {
	Name         string     `json:"name"`
	Today        string     `json:"today"`
	Logged       bool       `json:"logged"`
	CycleDay     int        `json:"cycleDay"`
	Phase        string     `json:"phase"`
	InPeriod     bool       `json:"inPeriod"`
	PeriodEnd    string     `json:"periodEnd"`
	NextStart    string     `json:"nextStart"`
	Late         int        `json:"late"`
	Ovulation    string     `json:"ovulation"`
	CycleLength  int        `json:"cycleLength"`
	PeriodLength int        `json:"periodLength"`
	Log          *sharedLog `json:"log"`
}

type sharedLog struct {
	Moods          []string        `json:"moods"`
	Symptoms       []string        `json:"symptoms"`
	CustomSymptoms []customSymptom `json:"custom_symptoms"`
}

func registerPartnerRoutes(se *core.ServeEvent) {
	se.Router.GET("/api/app/partner/{token}", func(e *core.RequestEvent) error {
		token := e.Request.PathValue("token")
		share, err := e.App.FindFirstRecordByData("shares", "token", token)
		if err != nil || len(token) != 24 {
			return e.NotFoundError("This link was turned off or is wrong.", nil)
		}
		user, err := e.App.FindRecordById("users", share.GetString("user"))
		if err != nil {
			return e.NotFoundError("This link was turned off or is wrong.", nil)
		}
		view, err := partnerSummary(e.App, user, share.GetBool("show_log"), partnerToday(e.Request.URL.Query().Get("today")))
		if err != nil {
			return e.InternalServerError("", err)
		}
		return e.JSON(http.StatusOK, view)
	})
}

// partnerToday is the partner's own date when it's sent and plausible, so the
// summary matches their calendar; otherwise the server's.
func partnerToday(sent string) cycle.Day {
	now := cycle.Of(time.Now())
	if d, err := cycle.Parse(sent); err == nil && d >= now-1 && d <= now+1 {
		return d
	}
	return now
}

func isoDate(d cycle.Day) string {
	return time.Unix(int64(d)*86400, 0).UTC().Format(time.DateOnly)
}

func partnerSummary(app core.App, user *core.Record, showLog bool, now cycle.Day) (partnerView, error) {
	view := partnerView{Name: user.GetString("name"), Today: isoDate(now)}
	bleeding, temps, err := loggedCycle(app, user, now)
	if err != nil {
		return view, err
	}
	if f, ok := cycle.Predict(bleeding, temps, settingsOf(user), now); ok {
		view.Logged = true
		view.CycleDay = int(now-f.LastStart) + 1
		view.Phase = f.Phase(now)
		view.InPeriod = f.InPeriod
		view.PeriodEnd = isoDate(f.PeriodEnd)
		view.NextStart = isoDate(f.NextStart)
		view.Late = f.Late
		view.CycleLength, view.PeriodLength = f.CycleLength, f.PeriodLength
		for _, o := range f.Ovulations {
			if o+1 >= now {
				view.Ovulation = isoDate(o)
				break
			}
		}
	}

	if showLog {
		today, err := app.FindFirstRecordByFilter("days", "user = {:user} && date = {:date}",
			dbx.Params{"user": user.Id, "date": view.Today})
		if err == nil {
			view.Log = &sharedLog{
				Moods:    today.GetStringSlice("moods"),
				Symptoms: today.GetStringSlice("symptoms"),
			}
			_ = today.UnmarshalJSONField("custom_symptoms", &view.Log.CustomSymptoms)
		} else {
			view.Log = &sharedLog{}
		}
	}
	return view, nil
}
