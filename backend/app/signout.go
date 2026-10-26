package app

import (
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/selfhostit/flowy/push"
)

// Signing out everywhere, say after losing a phone: a new token key makes every
// token handed out so far invalid, so other devices are signed out the next time
// they reach the server (and then remove their copy of the logs). Their
// notifications stop straight away.
func registerSignOutRoutes(se *core.ServeEvent) {
	se.Router.POST("/api/app/signout-everywhere", func(e *core.RequestEvent) error {
		e.Auth.RefreshTokenKey()
		err := e.App.RunInTransaction(func(tx core.App) error {
			if err := tx.Save(e.Auth); err != nil {
				return err
			}
			subs, err := tx.FindAllRecords(push.Collection, dbx.HashExp{"user": e.Auth.Id})
			if err != nil {
				return err
			}
			for _, s := range subs {
				if err := tx.Delete(s); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return e.InternalServerError("", err)
		}
		e.App.Logger().Info("Signed out everywhere", "user", e.Auth.Id)
		return e.NoContent(http.StatusNoContent)
	}).Bind(apis.RequireAuth("users"))
}
