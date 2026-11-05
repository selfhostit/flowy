package app

import "github.com/pocketbase/pocketbase/core"

// publicUserFields are the parts of someone's account that other people on the same
// server may see. Everything else on users (cycle lengths, which reminders are on) is
// only shown to that person themselves, so a new field stays private unless added here.
var publicUserFields = map[string]bool{
	"id": true, "collectionId": true, "collectionName": true,
	"name": true, "avatar": true, "role": true, "created": true, "updated": true,
	"email": true, "emailVisibility": true, "verified": true,
}

// registerUserPrivacy hides a person's settings from everyone but themselves (and
// superusers), wherever a user record is returned: lists, views and expands.
func registerUserPrivacy(app core.App) {
	app.OnRecordEnrich("users").BindFunc(func(e *core.RecordEnrichEvent) error {
		auth := e.RequestInfo.Auth
		if auth != nil && (auth.IsSuperuser() || (auth.Collection().Name == "users" && auth.Id == e.Record.Id)) {
			return e.Next()
		}
		for _, f := range e.Record.Collection().Fields {
			if !publicUserFields[f.GetName()] {
				e.Record.Hide(f.GetName())
			}
		}
		return e.Next()
	})
}
