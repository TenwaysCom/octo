SERVER_DIR := server
EXT_DIR := extension
EXT_DEV_PORT ?= 3011
EXT_PROFILE_DIR ?= $(HOME)/.config/octo-ext-profile

.DEFAULT_GOAL := help

.PHONY: help completion server-dev test-server test-client ext-dev ext-dev-manual ext-dev-profile ext-dev-probe ext-build ext-test ext-typecheck deploy-test deploy-prod

help: ## Show available make targets
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

completion: ## Print shell completion script for make targets (bash/zsh)
	@printf '%s\n' \
		'# shellcheck shell=sh' \
		'if [ -n "$$ZSH_VERSION" ]; then' \
		'  autoload -U +X bashcompinit && bashcompinit' \
		'fi' \
		'_tw_octo_make_complete() {' \
		'  local cur targets' \
		'  cur="${COMP_WORDS[COMP_CWORD]}"' \
		'  targets="$$(make -qp 2>/dev/null | awk -F: '\''/^[a-zA-Z0-9][^$$#\/\t=]*:([^=]|$$)/ { split($$1, names, /[[:space:]]+/); for (i in names) if (names[i] != "" && names[i] !~ /^\./) print names[i] }'\'' | sort -u)"' \
		'  COMPREPLY=($$(compgen -W "$$targets" -- "$$cur"))' \
		'}' \
		'complete -F _tw_octo_make_complete make'

server-dev: ## Run the backend server in watch mode
	npm --prefix $(SERVER_DIR) run dev

test-server: ## Run backend tests
	npm --prefix $(SERVER_DIR) test

test-client: ## Run extension tests
	pnpm --dir $(EXT_DIR) test

ext-dev: ## Run the extension in dev mode
	pnpm --dir $(EXT_DIR) dev

ext-dev-manual: ## Run extension dev mode without a persisted Chromium profile
	WXT_DEV_PORT="$(EXT_DEV_PORT)" WXT_CHROMIUM_PROFILE= pnpm --dir $(EXT_DIR) run dev:manual

ext-dev-profile: ## Run extension dev mode with a dedicated Chromium profile
	WXT_DEV_PORT="$(EXT_DEV_PORT)" WXT_CHROMIUM_PROFILE="$(EXT_PROFILE_DIR)" pnpm --dir $(EXT_DIR) run dev:profile

ext-dev-probe: ## Run extension dev mode with probe mode enabled
	WXT_DEV_PORT="$(EXT_DEV_PORT)" WXT_CHROMIUM_PROFILE="$(EXT_PROFILE_DIR)" WXT_PUBLIC_INJECTION_PROBE="true" pnpm --dir $(EXT_DIR) run dev:profile

ext-build: ## Build the extension
	pnpm --dir $(EXT_DIR) build

ext-test: ## Run extension tests
	pnpm --dir $(EXT_DIR) test

ext-typecheck: ## Type-check the extension
	pnpm --dir $(EXT_DIR) typecheck

deploy-test: ## Deploy to test server (git pull only)
	./scripts/deploy-test.sh

deploy-prod: ## Deploy to production server (full build + pm2 restart)
	./scripts/deploy-prod.sh
