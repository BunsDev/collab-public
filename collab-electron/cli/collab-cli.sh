#!/usr/bin/env bash
set -euo pipefail

VERSION="0.1.0"
GRID_UNIT=20
SOCKET_PATH_FILE="$HOME/.collaborator/socket-path"

# --- helpers ---------------------------------------------------------------

die() {
  echo "error: $1" >&2
  exit "${2:-1}"
}

read_socket_path() {
  [[ -f "$SOCKET_PATH_FILE" ]] ||
    die "collaborator is not running (no socket-path file)" 2
  local sock
  sock="$(cat "$SOCKET_PATH_FILE")"
  [[ -S "$sock" ]] ||
    die "collaborator is not running (socket missing)" 2
  echo "$sock"
}

rpc_call() {
  local method="$1" params="$2"
  local sock
  sock="$(read_socket_path)" || exit $?
  local payload
  payload=$(printf '{"jsonrpc":"2.0","id":1,"method":"%s","params":%s}\n' \
    "$method" "$params")

  local response
  response="$(perl -e '
    use IO::Socket::UNIX;
    my $sock = IO::Socket::UNIX->new(
      Peer => $ARGV[0], Type => IO::Socket::UNIX::SOCK_STREAM,
    ) or die "connect: $!";
    $sock->print($ARGV[1] . "\n");
    $sock->flush;
    local $SIG{ALRM} = sub { die "timeout" };
    alarm 5;
    my $line = <$sock>;
    alarm 0;
    chomp $line if defined $line;
    print $line // "";
    $sock->close;
  ' "$sock" "$payload" 2>/dev/null)" ||
    die "connection to collaborator failed" 2

  if printf '%s' "$response" | grep -q '"error"'; then
    local errmsg
    errmsg="$(printf '%s' "$response" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')"
    echo "$response" >&2
    die "${errmsg:-RPC error}" 1
  fi

  printf '%s\n' "$response"
}

grid_to_px() {
  echo $(( $1 * GRID_UNIT ))
}

px_to_grid() {
  echo $(( $1 / GRID_UNIT ))
}

parse_pos() {
  local pos="$1"
  local x y
  x="${pos%%,*}"
  y="${pos##*,}"
  [[ "$x" =~ ^[0-9]+$ ]] || die "invalid position: $pos"
  [[ "$y" =~ ^[0-9]+$ ]] || die "invalid position: $pos"
  echo "$x" "$y"
}

parse_size() {
  local size="$1"
  local w h
  w="${size%%,*}"
  h="${size##*,}"
  [[ "$w" =~ ^[0-9]+$ ]] || die "invalid size: $size"
  [[ "$h" =~ ^[0-9]+$ ]] || die "invalid size: $size"
  echo "$w" "$h"
}

px_fields_to_grid() {
  local response="$1"
  shift
  local result="$response"
  for field in "$@"; do
    result="$(printf '%s' "$result" | perl -pe "
      s/\"${field}\":\s*(\d+)/
        '\"${field}\":' . int(\$1 \/ $GRID_UNIT)
      /ge")"
  done
  printf '%s\n' "$result"
}

convert_tiles_response() {
  px_fields_to_grid "$1" x y width height
}

# --- usage -----------------------------------------------------------------

usage() {
  cat <<HELP
collab — control the Collaborator canvas from the command line

USAGE
  collab <command> [options]

COMMANDS
  tile list                          List all tiles on the canvas
  tile add <type> [options]          Add a new tile
  tile rm <id>                       Remove a tile
  tile move <id> --pos x,y           Move a tile
  tile resize <id> --size w,h        Resize a tile
  help, --help                       Show this help

TILE ADD OPTIONS
  <type>          Tile type: term, note, code, image, graph
  --file <path>   File to open in the tile
  --pos x,y       Position in grid units (default: 0,0)
  --size w,h      Size in grid units (default: type-dependent)

TILE MOVE OPTIONS
  --pos x,y       New position in grid units

TILE RESIZE OPTIONS
  --size w,h      New size in grid units

COORDINATES
  All coordinates are in grid units.
  One grid unit = 20 pixels on the canvas.

EXIT CODES
  0   Success
  1   RPC error
  2   Connection failure

VERSION
  collab v$VERSION
HELP
  exit 0
}

# --- subcommands -----------------------------------------------------------

cmd_tile_list() {
  local response
  response="$(rpc_call "canvas.tileList" "{}")"
  convert_tiles_response "$response"
}

cmd_tile_add() {
  local tile_type="" file="" pos_x=0 pos_y=0 size_w="" size_h=""

  [[ $# -ge 1 ]] || die "tile add requires a type (term, note, code, image, graph)"
  tile_type="$1"; shift

  case "$tile_type" in
    term|note|code|image|graph) ;;
    *) die "unknown tile type: $tile_type (expected: term, note, code, image, graph)" ;;
  esac

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --file)
        [[ $# -ge 2 ]] || die "--file requires a path"
        file="$2"; shift 2
        ;;
      --pos)
        [[ $# -ge 2 ]] || die "--pos requires x,y"
        local coords
        coords="$(parse_pos "$2")"
        pos_x="${coords%% *}"
        pos_y="${coords##* }"
        shift 2
        ;;
      --size)
        [[ $# -ge 2 ]] || die "--size requires w,h"
        local dims
        dims="$(parse_size "$2")"
        size_w="${dims%% *}"
        size_h="${dims##* }"
        shift 2
        ;;
      *) die "unknown option: $1" ;;
    esac
  done

  local px_x px_y
  px_x="$(grid_to_px "$pos_x")"
  px_y="$(grid_to_px "$pos_y")"

  local params
  params="{\"tileType\":\"$tile_type\""
  params="$params,\"position\":{\"x\":$px_x,\"y\":$px_y}"

  if [[ -n "$file" ]]; then
    local abs_file
    abs_file="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"
    params="$params,\"filePath\":\"$abs_file\""
  fi

  if [[ -n "$size_w" && -n "$size_h" ]]; then
    local px_w px_h
    px_w="$(grid_to_px "$size_w")"
    px_h="$(grid_to_px "$size_h")"
    params="$params,\"size\":{\"width\":$px_w,\"height\":$px_h}"
  fi

  params="$params}"

  rpc_call "canvas.tileAdd" "$params"
}

cmd_tile_rm() {
  [[ $# -ge 1 ]] || die "tile rm requires a tile id"
  local tile_id="$1"
  rpc_call "canvas.tileRemove" "{\"tileId\":\"$tile_id\"}"
}

cmd_tile_move() {
  local tile_id="" pos_x="" pos_y=""

  [[ $# -ge 1 ]] || die "tile move requires a tile id"
  tile_id="$1"; shift

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pos)
        [[ $# -ge 2 ]] || die "--pos requires x,y"
        local coords
        coords="$(parse_pos "$2")"
        pos_x="${coords%% *}"
        pos_y="${coords##* }"
        shift 2
        ;;
      *) die "unknown option: $1" ;;
    esac
  done

  [[ -n "$pos_x" ]] || die "tile move requires --pos x,y"

  local px_x px_y
  px_x="$(grid_to_px "$pos_x")"
  px_y="$(grid_to_px "$pos_y")"

  rpc_call "canvas.tileMove" "{\"tileId\":\"$tile_id\",\"position\":{\"x\":$px_x,\"y\":$px_y}}"
}

cmd_tile_resize() {
  local tile_id="" size_w="" size_h=""

  [[ $# -ge 1 ]] || die "tile resize requires a tile id"
  tile_id="$1"; shift

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --size)
        [[ $# -ge 2 ]] || die "--size requires w,h"
        local dims
        dims="$(parse_size "$2")"
        size_w="${dims%% *}"
        size_h="${dims##* }"
        shift 2
        ;;
      *) die "unknown option: $1" ;;
    esac
  done

  [[ -n "$size_w" ]] || die "tile resize requires --size w,h"

  local px_w px_h
  px_w="$(grid_to_px "$size_w")"
  px_h="$(grid_to_px "$size_h")"

  rpc_call "canvas.tileResize" "{\"tileId\":\"$tile_id\",\"size\":{\"width\":$px_w,\"height\":$px_h}}"
}

# --- main dispatch ---------------------------------------------------------

[[ $# -ge 1 ]] || usage

case "$1" in
  help|--help|-h)
    usage
    ;;
  --version|-v)
    echo "collab v$VERSION"
    exit 0
    ;;
  tile)
    [[ $# -ge 2 ]] || die "tile requires a subcommand (list, add, rm, move, resize)"
    subcmd="$2"; shift 2
    case "$subcmd" in
      list)   cmd_tile_list "$@" ;;
      add)    cmd_tile_add "$@" ;;
      rm)     cmd_tile_rm "$@" ;;
      move)   cmd_tile_move "$@" ;;
      resize) cmd_tile_resize "$@" ;;
      *)      die "unknown tile subcommand: $subcmd" ;;
    esac
    ;;
  *)
    die "unknown command: $1 (try: collab --help)"
    ;;
esac
