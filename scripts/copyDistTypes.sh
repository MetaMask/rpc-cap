#!/usr/bin/env bash

set -u
set -o pipefail

# constants

NO_DIST_MSG='Please run `yarn build:typescript` before continuing.'

DIST='dist'
DIST_SRC='dist/src'
DIST_TYPES='dist/src/@types'

SRC_TYPES='src/@types'

# error func
function abort {
  local message="${1}"

  printf "ERROR: %s\\n" "${message}" >&2

  exit 1
}

function main {

  if [[ ! -d "${DIST}" || ! -d "${DIST_SRC}" ]]; then
      abort "$NO_DIST_MSG"
  fi

  cp -r "${SRC_TYPES}" "${DIST_SRC}"
}

main
