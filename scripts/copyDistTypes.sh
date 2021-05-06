#!/usr/bin/env bash

set -u
set -o pipefail

# constants

NO_DIST_MSG="Please run \`yarn build:typescript\` before continuing."

DIST='dist'
DIST_TYPES_PATH='dist/types'

SRC_TYPES_PATH='src/types'

# error func
function abort {
  local message="${1}"

  printf "ERROR: %s\\n" "${message}" >&2

  exit 1
}

function main {

  if [[ ! -d "${DIST}" ]]; then
      abort "$NO_DIST_MSG"
  fi

  cp -r "${SRC_TYPES_PATH}" "${DIST_TYPES_PATH}"
}

main
