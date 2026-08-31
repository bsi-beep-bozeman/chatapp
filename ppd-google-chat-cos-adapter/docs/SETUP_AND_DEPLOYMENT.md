# Setup and deployment

These instructions describe an administrator-performed trusted-tester deployment. They do not connect a live queue: PPD has no live HTTPS ingestion service yet, and `TRANSPORT_MODE=disabled` must remain the initial setting.

Google's current references are the [Apps Script Chat app quickstart](https://developers.google.com/workspace/chat/quickstart/apps-script-app), [interaction-event guide](https://developers.google.com/workspace/chat/receive-respond-interactions), [Chat authentication guide](https://developers.google.com/workspace/chat/authenticate-authorize), and [Apps Script Properties guide](https://developers.google.com/apps-script/guides/properties).

## Prerequisites

- A PPD-managed Google Workspace administrator account for `ppdpainting.com`.
- A PPD-controlled Google Cloud project inside the PPD organization, separate from unrelated production workloads.
- Google Chat enabled for the trusted testers.
- A reviewed release copy of this standalone folder. Do not copy PMT or cockpit files into the Apps Script project.
- Named trusted testers or a tightly controlled PPD group. Start with the smallest set needed to test.

The app is one internal Chat app for all eventual users, not one deployment per employee.

## Cloud project

1. In Google Cloud Console, create or select the PPD-controlled project.
2. Open Google Auth Platform > Branding and supply the internal app name, support contact, and developer contact.
3. Under Audience, select **Internal**. If Internal is unavailable, stop: the project is not correctly attached to the PPD Workspace organization.
4. Enable the Google Chat API.
5. Do not enable delete, message-read, membership-management, Drive, or Sheets scopes for this prototype.
6. In Apps Script, open Project Settings and link the script to this standard Cloud project by project number. Use the same project for Chat API configuration.

Google's quickstart currently directs Workspace-only apps to the Internal audience and requires the Chat API to be enabled before configuration.

## Apps Script deployment

1. Create a new standalone Apps Script project owned by a PPD-controlled account.
2. Give it an unambiguous test name such as “PPD Chief of Staff Chat — Test”.
3. Add each file in `src/` as an Apps Script `.gs` file. Preserve the source contents; Apps Script file ordering is not an authorization boundary.
4. Replace the generated manifest with the reviewed `appsscript.json`. In Project Settings, enable showing the manifest if needed.
5. Confirm the V8 runtime and exception logging are enabled.
6. Under Services, add the Google Chat API advanced service at version `v1`; the manifest declares the same dependency.
7. Choose Deploy > Test deployments and copy the Head deployment ID. Do not publish a production deployment.

The test deployment runs the standard `onMessage`, `onAddToSpace`, `onRemoveFromSpace`, and `onCardClick` entry points. Dialog callbacks route to the fixed functions defined in `EntryPoints.gs`.

## Chat API configuration

1. In the linked Cloud project's Google Chat API, open Configuration.
2. Clear “Build this Chat app as a Google Workspace add-on”; this scaffold uses an Apps Script connection.
3. Supply the PPD test app name, description, and a PPD-controlled HTTPS avatar URL.
4. Under Functionality, enable direct messages and joining test spaces/group conversations.
5. Under Connection settings, select **Apps Script** and enter the Head deployment ID.
6. Turn on Chat app error logging for the test project. Keep logs redacted as described in the secret guide.
7. Under Visibility, select **Specific people and groups in your domain** and list only the approved PPD testers or test group.
8. Save, then wait for the configuration to propagate before searching for the app in Chat.

Incoming webhooks are notification-only. They cannot receive conversational interaction events or implement these approval controls and are not the final solution.

## Trusted testers

Add only named `ppdpainting.com` testers or a reviewed PPD group. Ask testers to use synthetic, non-sensitive requests. Test in one DM and one dedicated shared space. Do not add all 16 employees until the production gates are met.

The Workspace/Chat visibility control is the first deployment boundary. Runtime identity checks are a second boundary, not a substitute for visibility restrictions.

## Script Properties

In Apps Script Project Settings, add only the property names needed for the selected test. Never paste values into source, HTML, Markdown, comments, logs, ordinary Drive files, or this guide.

```text
TRANSPORT_MODE
INGESTION_URL
QUEUE_HMAC_KEY_ID
QUEUE_HMAC_SECRET
PROACTIVE_ENABLED
CHAT_APP_SERVICE_ACCOUNT_JSON
EXPECTED_WORKSPACE_DOMAIN_ID
```

For the first deployment, configure only the safe mode: `TRANSPORT_MODE=disabled`. Leave ingestion and proactive credentials absent. `EXPECTED_WORKSPACE_DOMAIN_ID` is optional corroboration; the canonical Chat user resource remains the primary identity.

Do not configure `TRANSPORT_MODE=https` until an independently reviewed ingestion service actually exists, authenticates requests, validates the schemas, maps the verified identity through the Access Registry, performs durable idempotency, and returns one of the explicit result states.

## Smoke test

1. Open a DM with the app as an allowed tester and send a synthetic request.
2. Confirm the response says the service is not connected yet and nothing was queued or changed.
3. Add the app to the dedicated shared test space and mention it with a synthetic request.
4. Confirm the response is generic and reveals no personal or sensitive result.
5. Exercise the approval card with sanitized fixture bindings. Confirm Approve, Reject, Explain, and Remind Me submit proposal events only; Amend opens a dialog and submits a new hashed amendment proposal.
6. Exercise a clarification dialog and confirm it produces a new clarification-answer envelope.
7. Confirm an external-domain corroborating email, bot actor, malformed ID, stale event, changed payload hash, expired approval, and mismatched target all fail closed in local tests.
8. Inspect Cloud Logging only for redacted error codes and verify no request body, secret, credential, or sensitive result was written.

Do not mark the Google Workspace smoke test complete until an administrator has performed it; local tests cannot do so.

## Rollback

1. In Chat API Configuration, remove all Visibility entries or disable the app configuration.
2. Keep `TRANSPORT_MODE=disabled` and `PROACTIVE_ENABLED` disabled.
3. Revoke and rotate any test credential that was configured in Script Properties.
4. Archive the deployment record and reviewed source revision; do not delete audit evidence.
5. If exposure is suspected, follow the incident-response steps in `SECRET_HANDLING.md` before redeployment.

Rollback must not delete Chief of Staff data because this adapter owns none. Removing the app from a space emits a lifecycle proposal; it never deletes shared state.

