package cycle

import (
	"testing"
	"time"
)

func day(t *testing.T, s string) Day {
	t.Helper()
	d, err := Parse(s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func run(t *testing.T, from string, n int) []Day {
	var out []Day
	for i := range n {
		out = append(out, day(t, from)+Day(i))
	}
	return out
}

func TestOf(t *testing.T) {
	brussels, _ := time.LoadLocation("Europe/Brussels")
	late := time.Date(2026, 10, 23, 23, 30, 0, 0, brussels)
	if got, want := Of(late), day(t, "2026-10-23"); got != want {
		t.Errorf("Of(%v) = %d, want %d", late, got, want)
	}
}

func TestPredict(t *testing.T) {
	if _, ok := Predict(nil, nil, Defaults, day(t, "2026-01-01")); ok {
		t.Error("predicted without any logged period")
	}

	// two 30-day cycles of 4-day periods (same case as web/src/lib/cycle.test.ts)
	bleeding := append(append(run(t, "2026-01-01", 4), run(t, "2026-01-31", 4)...), run(t, "2026-03-02", 4)...)
	f, _ := Predict(bleeding, nil, Defaults, day(t, "2026-03-20"))
	if f.NextStart != day(t, "2026-04-01") || f.InPeriod || f.Late != 0 {
		t.Errorf("got %+v, want the next period on 2026-04-01", f)
	}
	if f.Ovulations[0] != day(t, "2026-03-18") || f.Ovulations[1] != day(t, "2026-04-17") {
		t.Errorf("ovulations %v, want 2026-03-18 and 2026-04-17", f.Ovulations)
	}

	f, _ = Predict([]Day{day(t, "2026-02-01")}, nil, Defaults, day(t, "2026-02-03"))
	if !f.InPeriod {
		t.Error("not in a period on its third expected day")
	}

	f, _ = Predict(run(t, "2026-01-01", 5), nil, Defaults, day(t, "2026-02-02"))
	if f.Late != 4 {
		t.Errorf("late %d days, want 4", f.Late)
	}
}

func TestPeriodsBridgeAMissedDay(t *testing.T) {
	ps := Periods([]Day{day(t, "2026-01-04"), day(t, "2026-01-01"), day(t, "2026-01-02"), day(t, "2026-01-02")})
	if len(ps) != 1 || ps[0] != (Period{day(t, "2026-01-01"), day(t, "2026-01-04")}) {
		t.Errorf("got %v", ps)
	}
}

// the same days as the cyclePhase test in web/src/lib/cycle.test.ts
func TestPhase(t *testing.T) {
	bleeding := run(t, "2026-01-01", 5)
	for date, want := range map[string]string{
		"2026-01-02": "menstrual",
		"2026-01-07": "follicular",
		"2026-01-15": "fertile",
		"2026-01-20": "luteal",
	} {
		now := day(t, date)
		f, _ := Predict(bleeding, nil, Defaults, now)
		if got := f.Phase(now); got != want {
			t.Errorf("phase on %s = %s, want %s", date, got, want)
		}
	}
	f, _ := Predict(bleeding, nil, Defaults, day(t, "2026-01-10"))
	if f.LastStart != day(t, "2026-01-01") || f.PeriodEnd != day(t, "2026-01-05") || f.CycleLength != 28 {
		t.Errorf("got %+v", f)
	}
}

// temps are low readings from a day on, then high ones (same as web/src/lib/cycle.test.ts)
func temps(t *testing.T, from string, low, high int) []Temp {
	var out []Temp
	for i, d := range run(t, from, low+high) {
		c := 36.4
		if i >= low {
			c = 36.7
		}
		out = append(out, Temp{d, c})
	}
	return out
}

func TestWeightsRecentCycles(t *testing.T) {
	// a 26-day cycle, then a 30-day one: (26 + 2×30) / 3 rounds to 29
	bleeding := append(append(run(t, "2026-01-01", 4), run(t, "2026-01-27", 4)...), run(t, "2026-02-26", 4)...)
	f, _ := Predict(bleeding, nil, Defaults, day(t, "2026-03-10"))
	if f.CycleLength != 29 || f.Margin != 2 {
		t.Errorf("cycle %d ± %d, want 29 ± 2", f.CycleLength, f.Margin)
	}
}

func TestOvulation(t *testing.T) {
	if o, ok := Ovulation(temps(t, "2026-01-01", 13, 3)); !ok || o != day(t, "2026-01-13") {
		t.Errorf("ovulation %d, %v; want 2026-01-13", o, ok)
	}
	if _, ok := Ovulation(temps(t, "2026-01-01", 13, 2)); ok {
		t.Error("ovulation from two high readings")
	}
}

func TestLearnsFromTemperatures(t *testing.T) {
	bleeding := append(run(t, "2026-01-01", 4), run(t, "2026-01-29", 4)...)
	ts := append(temps(t, "2026-01-01", 13, 15), temps(t, "2026-01-29", 12, 3)...)
	f, _ := Predict(bleeding, ts, Defaults, day(t, "2026-02-12"))
	// ovulation on 13 January, 16 days before the period; this cycle on 9 February
	if f.LutealLength != 16 || f.NextStart != day(t, "2026-02-25") || f.Margin != 1 {
		t.Errorf("got %+v, want a 16-day luteal phase and the period on 2026-02-25 ± 1", f)
	}
	if f.Ovulations[0] != day(t, "2026-02-09") {
		t.Errorf("ovulations %v, want 2026-02-09 first", f.Ovulations)
	}
}
