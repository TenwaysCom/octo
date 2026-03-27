SERVER_DIR := server
EXT_DIR := extension
EXT_DEV_PORT ?= 3011
EXT_PROFILE_DIR ?= $(HOME)/.config/octo-ext-profile

.PHONY: server-dev test-server test-client ext-dev ext-dev-manual ext-dev-profile ext-build ext-test ext-typecheck

server-dev:
	npm --prefix $(SERVER_DIR) run dev

test-server:
	npm --prefix $(SERVER_DIR) test

test-client:
	pnpm --dir $(EXT_DIR) test

ext-dev:
	pnpm --dir $(EXT_DIR) dev

ext-dev-manual:
	WXT_DEV_PORT="$(EXT_DEV_PORT)" WXT_CHROMIUM_PROFILE= pnpm --dir $(EXT_DIR) run dev:manual

ext-dev-profile:
	WXT_DEV_PORT="$(EXT_DEV_PORT)" WXT_CHROMIUM_PROFILE="$(EXT_PROFILE_DIR)" pnpm --dir $(EXT_DIR) run dev:profile

ext-build:
	pnpm --dir $(EXT_DIR) build

ext-test:
	pnpm --dir $(EXT_DIR) test

ext-typecheck:
	pnpm --dir $(EXT_DIR) typecheck
