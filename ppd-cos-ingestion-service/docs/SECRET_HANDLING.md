# Secret handling

Real secret values must never appear in source, HTML, Markdown, commit history, ordinary Drive files, screenshots, tickets, test fixtures, command output, or application logs. The service never logs request bodies, signatures, key identifiers, connection strings, tokens, employee identity, or payload hashes.

Development authentication material must be synthetic, ignored by Git, and supplied only through process-local environment input. `.env` files are ignored and must not be shared or placed in Drive. Tests use synthetic values that confer no access to any external system.

Production must use version-pinned Google Secret Manager versions obtained with workload identity. The service identity receives least privilege to access only the required secret resource versions. Human users and the Google Chat runtime do not receive database or queue credentials.

Rotation uses a bounded overlap: publish a new version, allow both old and new key identifiers only for the planned transition window, verify traffic on the new version, then revoke the old version. Never overwrite a secret in place or log either value during diagnosis.

Enable Secret Manager access logging and alert on unexpected principals, denied reads, and access outside the deployment workload. Separate development, staging, and production secrets and identities. Incident response revokes the affected version, deploys the replacement reference, verifies authentication and queue health, and records only identifiers safe for the audit log.

The repository secret scan detects common private keys, Google API keys, Chat webhook URLs, and quoted credential assignments. It supplements managed repository scanning; it is not a guarantee that every secret format can be detected.
