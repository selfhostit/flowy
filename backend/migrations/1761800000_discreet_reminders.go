package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Discreet reminders: when on, reminders show only "Reminder from Flowy" on the
// lock screen, without saying what they are about (backend/app/reminders.go).
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		users.Fields.Add(&core.BoolField{Name: "discreet_reminders"})
		return app.Save(users)
	}, func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		users.Fields.RemoveByName("discreet_reminders")
		return app.Save(users)
	})
}
