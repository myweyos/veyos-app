.DEFAULT_GOAL := help
SHELL := /bin/bash

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: ## Install everything (node workspaces + engine dev deps)
	npm install
	python3 -m pip install -e "services/engine[dev]"

test: engine-test api-test ## Run every suite

engine-test: ## Golden fixtures. This suite must never go red.
	cd services/engine && python3 -m pytest

engine-lint: ## ruff + mypy on the engine
	cd services/engine && python3 -m ruff check . && python3 -m mypy weyos_engine backtest demo_driver

backtest: ## Rulebook backtest over the synthetic sweep, e.g. make backtest GRID=quick
	cd services/engine && python3 -m backtest run --synthetic --grid $(or $(GRID),boundary)

backtest-validated: ## Same, in validated-biometrics-only mode
	cd services/engine && python3 -m backtest run --synthetic --grid $(or $(GRID),boundary) --no-elemental

demo: ## Walk the scripted demo scenarios, e.g. make demo PERSONA=james
	cd services/engine && python3 -m demo_driver $(if $(PERSONA),--persona $(PERSONA),--all)

demo-regenerate: ## Rebuild demo-fixtures expected/ + decisions/ after a scenario or rulebook change
	cd services/engine && python3 -m demo_driver --generate

web: ## Serve the app in a browser on localhost:8081 (review screens without a device)
	cd apps/mobile && npx expo start --web

api-test: ## API unit tests
	npm run test --workspace @weyos/api --if-present

typecheck: ## TypeScript across all workspaces
	npm run typecheck

decision: ## Print a decision trace, e.g. make decision PERSONA=alex STATE=crash
	cd services/engine && python3 -m weyos_engine.cli --persona $(or $(PERSONA),sarah) --state $(or $(STATE),crash)

decision-validated: ## Same, in validated-biometrics-only mode
	cd services/engine && python3 -m weyos_engine.cli --persona $(or $(PERSONA),alex) --state $(or $(STATE),crash) --no-elemental

infra-up: ## Postgres/Timescale + Redis
	docker compose up -d

infra-down:
	docker compose down

dev: infra-up ## Infra + API in watch mode
	npm run dev --workspace @weyos/api

.PHONY: help setup test engine-test engine-lint api-test typecheck decision decision-validated backtest backtest-validated demo demo-regenerate web infra-up infra-down dev
