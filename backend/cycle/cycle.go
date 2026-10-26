// Package cycle predicts periods and fertile days from logged bleeding days,
// for reminders. web/src/lib/cycle.ts does the same for the app: keep the two
// in step.
package cycle

import (
	"math"
	"slices"
	"time"
)

// Day is a date as whole days since 1970-01-01.
type Day int

// Parse reads a YYYY-MM-DD date.
func Parse(s string) (Day, error) {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		return 0, err
	}
	return Day(t.Unix() / 86400), nil
}

// Of is the date of t in t's time zone.
func Of(t time.Time) Day {
	y, m, d := t.Date()
	return Day(time.Date(y, m, d, 0, 0, 0, 0, time.UTC).Unix() / 86400)
}

// Settings are the person's typical lengths, used until periods are logged.
type Settings struct {
	CycleLength, PeriodLength, LutealLength int
}

// Defaults fill in settings someone hasn't set.
var Defaults = Settings{CycleLength: 28, PeriodLength: 5, LutealLength: 14}

// Period is a run of bleeding days; one day without bleeding doesn't end it.
type Period struct{ Start, End Day }

// Periods groups bleeding days into periods.
func Periods(bleeding []Day) []Period {
	days := slices.Clone(bleeding)
	slices.Sort(days)
	var out []Period
	for _, d := range slices.Compact(days) {
		if n := len(out); n > 0 && d-out[n-1].End <= 2 {
			out[n-1].End = d
		} else {
			out = append(out, Period{d, d})
		}
	}
	return out
}

// Temp is a basal body temperature reading, in °C.
type Temp struct {
	Day     Day
	Celsius float64
}

// Forecast is what is expected next.
type Forecast struct {
	// NextStart is when the next period should start.
	NextStart Day
	// Margin is how many days either side of NextStart the period can be expected.
	Margin int
	// InPeriod is true while a period is going on.
	InPeriod bool
	// Late is how many days past NextStart there is no period yet.
	Late int
	// Ovulations are the expected ovulation days of this cycle and the next.
	Ovulations []Day
	// LastStart is when the last logged period started.
	LastStart Day
	// PeriodEnd is when the last period ends, logged or expected.
	PeriodEnd Day
	// CycleLength and PeriodLength are learned from the logs, LutealLength from
	// temperatures, or else they are the settings.
	CycleLength, PeriodLength, LutealLength int
}

// Phase names the part of the cycle now falls in, like cyclePhase in the web app:
// "menstrual", "follicular", "fertile" or "luteal".
func (f Forecast) Phase(now Day) string {
	switch o := f.Ovulations[0]; {
	case f.InPeriod:
		return "menstrual"
	case o <= f.LastStart || now > o+1:
		return "luteal"
	case now >= o-5:
		return "fertile"
	default:
		return "follicular"
	}
}

const learnFrom = 6

// Ovulation finds the day of ovulation from basal body temperatures, by the
// three over six rule: three readings above the highest of the six before them,
// the third at least 0.2 °C above it. Ovulation is the day before the first
// high reading. ok is false when there's no such shift.
func Ovulation(temps []Temp) (o Day, ok bool) {
	ts := slices.Clone(temps)
	slices.SortFunc(ts, func(a, b Temp) int { return int(a.Day - b.Day) })
	for i := 6; i+2 < len(ts); i++ {
		// gaps of a few days are fine, a week of readings over a month isn't
		if ts[i].Day-ts[i-6].Day > 10 || ts[i+2].Day-ts[i].Day > 4 {
			continue
		}
		cover := ts[i-6].Celsius
		for _, t := range ts[i-5 : i] {
			cover = max(cover, t.Celsius)
		}
		if ts[i].Celsius > cover && ts[i+1].Celsius > cover && ts[i+2].Celsius > cover &&
			ts[i+2].Celsius >= cover+0.2 {
			return ts[i].Day - 1, true
		}
	}
	return 0, false
}

// Predict forecasts from the bleeding days and any temperatures; ok is false
// before a period is logged.
func Predict(bleeding []Day, temps []Temp, s Settings, now Day) (f Forecast, ok bool) {
	ps := Periods(bleeding)
	if len(ps) == 0 {
		return f, false
	}
	tempsIn := func(from, to Day) []Temp {
		var out []Temp
		for _, t := range temps {
			if from <= t.Day && t.Day < to {
				out = append(out, t)
			}
		}
		return out
	}
	var cycles, lengths, luteals []int
	for i, p := range ps {
		if i+1 < len(ps) {
			next := ps[i+1].Start
			if l := int(next - p.Start); l >= 15 && l <= 60 {
				cycles = append(cycles, l)
			}
			// the time from ovulation to the next period hardly changes from
			// cycle to cycle, so it's learned where temperatures show ovulation
			if o, ok := Ovulation(tempsIn(p.Start, next)); ok {
				if l := int(next - o); l >= 7 && l <= 20 {
					luteals = append(luteals, l)
				}
			}
		}
		// a period that could still get another day isn't finished
		if l := int(p.End-p.Start) + 1; p.End+2 < now && l <= 15 {
			lengths = append(lengths, l)
		}
	}
	cycleLength := weighted(cycles, s.CycleLength)
	periodLength := weighted(lengths, s.PeriodLength)
	lutealLength := weighted(luteals, s.LutealLength)

	last := ps[len(ps)-1]
	end := max(last.End, last.Start+Day(periodLength)-1)
	f.LastStart, f.PeriodEnd = last.Start, end
	f.CycleLength, f.PeriodLength, f.LutealLength = cycleLength, periodLength, lutealLength
	f.InPeriod = last.Start <= now && now <= end
	// once a temperature shift shows ovulation, the period follows a luteal phase later
	if o, ok := Ovulation(tempsIn(last.Start, now+1)); ok {
		f.NextStart, f.Margin = o+Day(lutealLength), 1
	} else {
		f.NextStart, f.Margin = last.Start+Day(cycleLength), margin(cycles)
	}
	if !f.InPeriod && now > f.NextStart {
		f.Late = int(now - f.NextStart)
	}
	// a late period is expected any day now
	following := max(f.NextStart, now) + Day(cycleLength)
	f.Ovulations = []Day{f.NextStart - Day(lutealLength), following - Day(lutealLength)}
	return f, true
}

// weighted is the average of the last few values, each weighted by how recent
// it is, rounded like the web app does
func weighted(xs []int, fallback int) int {
	if len(xs) == 0 {
		return fallback
	}
	xs = xs[max(0, len(xs)-learnFrom):]
	sum, weights := 0, 0
	for i, x := range xs {
		sum += x * (i + 1)
		weights += i + 1
	}
	return round(float64(sum) / float64(weights))
}

// margin is how many days either side of the expected start, from how much
// the last few cycles varied
func margin(cycles []int) int {
	cycles = cycles[max(0, len(cycles)-learnFrom):]
	// cycles of most people vary by a couple of days
	if len(cycles) < 2 {
		return 2
	}
	mean := 0.0
	for _, c := range cycles {
		mean += float64(c)
	}
	mean /= float64(len(cycles))
	variance := 0.0
	for _, c := range cycles {
		variance += (float64(c) - mean) * (float64(c) - mean)
	}
	variance /= float64(len(cycles))
	return min(7, max(1, round(math.Sqrt(variance))))
}

func round(x float64) int { return int(math.Floor(x + 0.5)) }
