#!/usr/bin/env bash

set -e
set -x
set -o pipefail

if [[ ! -d "dist" ]]; then
  printf "Error: %s\\n" "Please run \`yarn build:typescript\` before continuing." >&2
  exit 1
fi

cp -r "src/types" "dist/types"
