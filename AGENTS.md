# Project Rules

- Never hardcode secrets (API keys, tokens, passwords, private URLs) in app code.
- Put secrets only in local environment files such as `.env` or `.env.local`.
- Never commit secret values to git.
- Keep required env variable names in `.env.example` with placeholder values only.
- When adding a feature that needs a new secret, explicitly tell the user which key(s) to add to `.env`.
