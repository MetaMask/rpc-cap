#!/usr/bin/env bash

set -e
set -x
set -o pipefail

NO_DIST_MSG="Please run \`yarn build:typescript\` before continuing."

# error func
function abort {
  local message="${1}"

  printf "ERROR: %s\\n" "${message}" >&2

  exit 1
}

function main {

  if [[ ! -d "dist" ]]; then
    abort "$NO_DIST_MSG"
  fi

  cp -r "src/types" "dist/types"
}

main
