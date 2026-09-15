# Change record — template

For new work, **the pull request is the change record**. The PR template carries these fields.
Use this file for retroactive records, for release records, and for any change that didn't go
through a PR.

| Field | Content |
|---|---|
| **Record id** | `LR-<EPIC>-NNN` |
| **Jira** | `SCRUM-NN` |
| **Change** | Commit hash(es), and the PR number if there is one |
| **Date / author** | |
| **Software items** | SI-1 … SI-8 (see `README.md`) |
| **Requirement** | The acceptance criteria it implements, or the plan section |
| **Design** | ADR(s), or the design note in the PR |
| **Risk** | Risk-file rows affected (`../risk-file.md`), or "none" |
| **Contract / rulebook** | Schema version change? Rulebook version change? Fixtures added? |
| **Verification** | The tests that cover it, and the CI result on that commit or PR |
| **Review** | Who approved it. **Write "none" when there was no review; don't leave it blank** |
| **Open items** | Anything raised and not resolved |
