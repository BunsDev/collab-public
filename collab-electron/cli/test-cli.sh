#!/usr/bin/env bash
set -euo pipefail

# Integration tests for collab CLI canvas commands.
# Requires: Collaborator app running, jq installed.
# Runs against the repo copy of collab-cli.sh, not the installed one.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/collab-cli.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass=0
fail=0
skip=0

ok() {
  printf "${GREEN}PASS${NC} %s\n" "$1"
  pass=$((pass + 1))
}

fail() {
  printf "${RED}FAIL${NC} %s: %s\n" "$1" "$2"
  fail=$((fail + 1))
}

skipped() {
  printf "${YELLOW}SKIP${NC} %s: %s\n" "$1" "$2"
  skip=$((skip + 1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    ok "$label"
  else
    fail "$label" "expected '$expected', got '$actual'"
  fi
}

# Extract .result from a JSON-RPC response
result_of() {
  printf '%s' "$1" | jq -c '.result'
}

# ---- preflight ------------------------------------------------------------

command -v jq >/dev/null 2>&1 || { echo "jq is required"; exit 1; }
[[ -x "$CLI" ]] || { echo "CLI not found at $CLI"; exit 1; }

# Check app is running
if ! "$CLI" --version >/dev/null 2>&1; then
  echo "Cannot run CLI (is it executable?)"
  exit 2
fi

echo "=== collab CLI integration tests ==="
echo ""

# ---- tile add -------------------------------------------------------------

echo "--- tile add ---"
add_out=$("$CLI" tile add note --pos 10,15 --size 22,27 2>/dev/null) \
  && add_ok=true || add_ok=false
tile_id=""
if $add_ok; then
  ok "tile add succeeds"
  tile_id=$(printf '%s' "$add_out" | jq -r '.result.tileId')
  if [[ -n "$tile_id" && "$tile_id" != "null" ]]; then
    ok "tile add returns tileId ($tile_id)"
  else
    fail "tile add returns tileId" "response: $add_out"
    tile_id=""
  fi
else
  fail "tile add" "command failed"
fi
echo ""

# ---- tile list ------------------------------------------------------------

echo "--- tile list ---"
list_out=$("$CLI" tile list 2>/dev/null) && list_ok=true || list_ok=false
if $list_ok; then
  ok "tile list succeeds"
else
  fail "tile list" "command failed"
fi

if [[ -n "$tile_id" ]]; then
  list_result=$(result_of "$list_out")
  tile_json=$(printf '%s' "$list_result" \
    | jq -c ".tiles[] | select(.id == \"$tile_id\")")
  if [[ -n "$tile_json" ]]; then
    ok "added tile found in list"
    t_px=$(printf '%s' "$tile_json" | jq '.position.x')
    t_py=$(printf '%s' "$tile_json" | jq '.position.y')
    t_sw=$(printf '%s' "$tile_json" | jq '.size.width')
    t_sh=$(printf '%s' "$tile_json" | jq '.size.height')
    assert_eq "tile position.x is 10" "10" "$t_px"
    assert_eq "tile position.y is 15" "15" "$t_py"
    assert_eq "tile size.width is 22" "22" "$t_sw"
    assert_eq "tile size.height is 27" "27" "$t_sh"
  else
    fail "added tile found in list" "tile $tile_id not in response"
  fi
else
  skipped "tile list verification" "no tile_id from add"
fi
echo ""

# ---- tile move ------------------------------------------------------------

echo "--- tile move ---"
if [[ -n "$tile_id" ]]; then
  mv_out=$("$CLI" tile move "$tile_id" --pos 25,30 2>/dev/null) \
    && mv_ok=true || mv_ok=false
  if $mv_ok; then
    ok "tile move succeeds"
  else
    fail "tile move" "command failed"
  fi

  # Read back and verify
  list2_out=$("$CLI" tile list 2>/dev/null) && true
  list2_result=$(result_of "$list2_out")
  t2_json=$(printf '%s' "$list2_result" \
    | jq -c ".tiles[] | select(.id == \"$tile_id\")")
  t2_px=$(printf '%s' "$t2_json" | jq '.position.x')
  t2_py=$(printf '%s' "$t2_json" | jq '.position.y')
  assert_eq "moved tile position.x is 25" "25" "$t2_px"
  assert_eq "moved tile position.y is 30" "30" "$t2_py"
else
  skipped "tile move" "no tile_id"
fi
echo ""

# ---- tile resize ----------------------------------------------------------

echo "--- tile resize ---"
if [[ -n "$tile_id" ]]; then
  rs_out=$("$CLI" tile resize "$tile_id" --size 40,35 2>/dev/null) \
    && rs_ok=true || rs_ok=false
  if $rs_ok; then
    ok "tile resize succeeds"
  else
    fail "tile resize" "command failed"
  fi

  # Read back and verify
  list3_out=$("$CLI" tile list 2>/dev/null) && true
  list3_result=$(result_of "$list3_out")
  t3_json=$(printf '%s' "$list3_result" \
    | jq -c ".tiles[] | select(.id == \"$tile_id\")")
  t3_sw=$(printf '%s' "$t3_json" | jq '.size.width')
  t3_sh=$(printf '%s' "$t3_json" | jq '.size.height')
  assert_eq "resized tile width is 40" "40" "$t3_sw"
  assert_eq "resized tile height is 35" "35" "$t3_sh"
else
  skipped "tile resize" "no tile_id"
fi
echo ""

# ---- tile rm --------------------------------------------------------------

echo "--- tile rm ---"
if [[ -n "$tile_id" ]]; then
  rm_out=$("$CLI" tile rm "$tile_id" 2>/dev/null) \
    && rm_ok=true || rm_ok=false
  if $rm_ok; then
    ok "tile rm succeeds"
  else
    fail "tile rm" "command failed"
  fi

  # Verify tile is gone
  list4_out=$("$CLI" tile list 2>/dev/null) && true
  list4_result=$(result_of "$list4_out")
  t4_json=$(printf '%s' "$list4_result" \
    | jq -c ".tiles[] | select(.id == \"$tile_id\")" 2>/dev/null)
  if [[ -z "$t4_json" ]]; then
    ok "removed tile no longer in list"
  else
    fail "removed tile no longer in list" "tile $tile_id still present"
  fi
else
  skipped "tile rm" "no tile_id"
fi
echo ""

# ---- summary --------------------------------------------------------------

echo "==========================="
printf "${GREEN}%d passed${NC}" "$pass"
[[ $fail -gt 0 ]] && printf ", ${RED}%d failed${NC}" "$fail"
[[ $skip -gt 0 ]] && printf ", ${YELLOW}%d skipped${NC}" "$skip"
echo ""
[[ $fail -eq 0 ]] && exit 0 || exit 1
