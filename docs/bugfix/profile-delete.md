# Deleting a profile: no confirmation, default profile deleted, leftovers

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (integration tests in ProfileDelete.test.ts and OBIController.test.ts) | [improvements v2.2.3 R1](../improvements/v2.2.3/README.md), [bugs.md #5](../bugs.md#5--deleting-the-default-profile-deletes-user-app-configtoml) | – |


# Current situation

The 🗑 button next to *Use profile* in the OBI Build view sent `delete_current_profile`. The handler in `OBIController` switched to the default profile and deleted the file of the profile that was active, without a question:

* With the default profile active, it deleted `.obi/etc/.user-app-config.toml`. The file isn't in git, so host, user and all user settings were lost for good.
* With a named profile, `.user-extended-source-processing-config-<profile>.toml`, the stored password and passphrase (`obi|<profile>|<host>|<user>[|passphrase]`) and the "Never for this profile" choices stayed behind. A new profile with the same name got them back.


# Fix

* `delete_current_profile(storage)` in [ProfileDelete.ts](../../src/extension/config/ProfileDelete.ts):
  * Default profile: refused with *The default profile can't be deleted.* (for a message of a page rendered before the fix).
  * Named profile: modal warning *Delete profile {0}?*, listing the files that exist and saying that stored secrets are removed. Only **Delete** goes on.
  * The keys of the secrets are built from host and user of the profile, read before the switch to the default profile. Then: switch, delete the user config and the user ESP file, delete password and passphrase, clear both "Never for this profile" flags.
* Key format in one place: `ssh_secret_key` and `never_save_key` in [Profile.ts](../../src/shared/Profile.ts), used by `SSH_Tasks`, `OBIConfiguration` and the delete. A missing host or user now gives an empty part instead of `undefined`. A password stored under such a key could not be used for a login anyway.
* Page: the 🗑 button is disabled while the default profile is selected (template and `controller.ts`, also after a switch in the dropdown).


# Tests

* Integration ([ProfileDelete.test.ts](../../src/test/suite/ProfileDelete.test.ts)):
  * Confirmed: both files deleted, default config kept, default profile active, secrets and flags of the profile removed.
  * Cancelled: nothing changes.
  * Default profile: no question, nothing deleted, information shown.
* Integration ([OBIController.test.ts](../../src/test/suite/OBIController.test.ts)): the button is rendered disabled for the default profile only.
* Unit ([Profile.test.ts](../../src/test/unit/Profile.test.ts)): key formats.


# Definition of done

* [x] Fix and tests
* [x] [configuration.md → Profiles](../../asserts/docs/configuration.md#profiles), CHANGELOG
* [x] bugs.md #5 marked fixed, entry R1 removed from the improvement list
