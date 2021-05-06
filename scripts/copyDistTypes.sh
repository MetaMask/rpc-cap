#!/usr/bin/env bash

set -e
set -x
set -o pipefail

function main {
  local NO_DIST_MSG="Please run \`yarn build:typescript\` before continuing."

  if [[ ! -d "dist" ]]; then
    printf "ERROR: %s\\n" "${NO_DIST_MSG}" >&2
    exit 1
  fi

  cp -r "src/types" "dist/types"
}

main
