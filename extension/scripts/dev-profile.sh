#!/bin/sh

set -eu

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"

cd "$project_dir"

original_wxt_dev_port="${WXT_DEV_PORT-}"
original_wxt_chromium_profile="${WXT_CHROMIUM_PROFILE-}"

if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

if [ -f ".env.local" ]; then
  set -a
  . ./.env.local
  set +a
fi

if [ -n "${original_wxt_dev_port}" ]; then
  WXT_DEV_PORT="${original_wxt_dev_port}"
fi

if [ -n "${original_wxt_chromium_profile}" ]; then
  WXT_CHROMIUM_PROFILE="${original_wxt_chromium_profile}"
fi

: "${WXT_DEV_PORT:=3011}"
: "${WXT_CHROMIUM_PROFILE:=$HOME/.config/octo-ext-profile}"

profile_dir="${WXT_CHROMIUM_PROFILE%/}"
profile_name="$(basename "${profile_dir}")"

case "${profile_name}" in
  Default|Profile\ *)
    ;;
  *)
    profile_dir="${profile_dir}/Default"
    ;;
esac

mkdir -p "${profile_dir}"

export WXT_DEV_PORT
export WXT_CHROMIUM_PROFILE="${profile_dir}"

exec wxt "$@"
