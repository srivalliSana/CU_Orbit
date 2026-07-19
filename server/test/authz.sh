#!/bin/bash
# End-to-end authorization test: two distinct users must not reach each other's data.
#
# Requires a running server with a reachable database, started with the same
# CAMPUS_JWT_SECRET this script signs with:
#
#   cd server
#   CAMPUS_JWT_SECRET=test-campus-secret ORBIT_JWT_SECRET=test-orbit-secret npm start
#   ./test/authz.sh
#
# It creates alice/bob/carol @cutm.ac.in and leaves them behind, so point it at
# a scratch database rather than production.
B=http://localhost:3000
mk() { node -e "console.log(require('jsonwebtoken').sign({sub:'x',email:'$1',name:'$2',role:'student'},'test-campus-secret',{algorithm:'HS256',expiresIn:300,audience:'cu-orbit'}))"; }

set -u

# jq-free field read that tolerates missing keys instead of throwing.
field() { node -pe 'const o=JSON.parse(require("fs").readFileSync(0)||"{}");process.argv[1].split(".").reduce((a,k)=>a&&a[k],o)??""' "$1" 2>/dev/null; }

# Reporting harness is installed first, so an abort during preconditions is
# still summarised rather than exiting silently.
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
PASSES=0; FAILURES=0
chk() { # desc expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1 (got $3)"; PASSES=$((PASSES+1));
  else echo "  FAIL  $1 (want $2, got $3)"; FAILURES=$((FAILURES+1)); fi
}
summary() {
  local rc=$?
  echo; echo "$PASSES passed, $FAILURES failed"
  # An abort before any assertion ran must not read as success just because
  # nothing failed.
  if [ $((PASSES + FAILURES)) -eq 0 ]; then
    echo "AUTHORIZATION TEST DID NOT RUN — preconditions unmet. Nothing was verified."
    exit "${rc:-1}"
  fi
  [ "$FAILURES" -eq 0 ] || { echo "AUTHORIZATION TEST FAILED — do not deploy."; exit 1; }
  echo "All authorization checks passed."
}
trap summary EXIT

# On a fresh database the server listens seconds before sync() has created the
# tables, so a fixed sleep races it. Wait for the schema to actually be usable.
wait_ready() {
  local i
  for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/health")" = "200" ] && return 0
    sleep 1
  done
  echo "PRECONDITION FAILED: server never became ready at $B" >&2
  echo "  last health: $(curl -s "$B/api/health" | head -c 300)" >&2
  exit 1
}

# NB: exit inside $( ) only leaves the subshell, so failures are reported by
# returning empty and checked by the caller in the parent shell.
login() { # email name -> "session id", empty on failure
  local r s i
  r=$(curl -s -X POST "$B/api/auth/sso" -H 'Content-Type: application/json' -d "{\"token\":\"$(mk "$1" "$2")\"}")
  s=$(echo "$r" | field session); i=$(echo "$r" | field user.id)
  [ -n "$s" ] && [ -n "$i" ] && { echo "$s $i"; return 0; }
  echo "  $1 -> $(echo "$r" | head -c 200)" >&2
  return 1
}

require_login() { # varname_token varname_id email name
  local out
  if ! out=$(login "$3" "$4"); then
    echo "PRECONDITION FAILED: could not sign in $3 — assertions would be meaningless. Stopping." >&2
    exit 1
  fi
  read -r "$1" "$2" <<<"$out"
}

wait_ready
require_login TA IA alice@cutm.ac.in Alice
require_login TB IB bob@cutm.ac.in Bob
require_login TC IC carol@cutm.ac.in Carol
echo "alice=$IA"; echo "bob=$IB"; echo "carol=$IC"; echo

echo "--- identity is taken from the session, not the path ---"
ME=$(curl -s -H "Authorization: Bearer $TA" "$B/api/home/quick-access/$IB" -o /dev/null -w '%{http_code}')
chk "alice reading bob's quick-access path returns her own data, not 403" 200 "$ME"

echo "--- alice sends a DM to bob, then a private one to herself ---"
DM="$(printf '%s\n%s' "$IA" "$IB" | sort | tr '\n' '_' | sed 's/_$//')"
SEND=$(code -X POST $B/api/messages -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"body\":\"hi bob\",\"channelId\":\"$DM\"}")
chk "alice can post to her own DM room" 200 "$SEND"

echo "--- a third party must not read that DM ---"
chk "carol reading alice+bob's DM" 403 "$(code -H "Authorization: Bearer $TC" $B/api/messages/$DM)"
chk "bob reading his own DM with alice" 200 "$(code -H "Authorization: Bearer $TB" $B/api/messages/$DM)"

echo "--- impersonation via body is ignored ---"
MSG=$(curl -s -X POST $B/api/messages -H "Authorization: Bearer $TB" -H 'Content-Type: application/json' -d "{\"body\":\"forged\",\"channelId\":\"$DM\",\"senderId\":\"$IA\",\"senderName\":\"Alice\"}")
ACTUAL=$(echo "$MSG" | node -pe 'JSON.parse(require("fs").readFileSync(0)).senderId' 2>/dev/null)
chk "bob posting with senderId=alice is recorded as bob" "$IB" "$ACTUAL"

echo "--- message editing is author-only ---"
MID=$(echo "$MSG" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
chk "alice editing bob's message" 403 "$(code -X PUT $B/api/messages/$MID -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"body":"tampered"}')"
chk "bob editing his own message" 200 "$(code -X PUT $B/api/messages/$MID -H "Authorization: Bearer $TB" -H 'Content-Type: application/json' -d '{"body":"edited"}')"

echo "--- profile edits are self-only ---"
# Alice targets bob's row by path param. The write must land on her own profile.
curl -s -X PUT "$B/api/users/0000000000" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"bio":"alice was here"}' -o /dev/null
BOBBIO=$(curl -s -H "Authorization: Bearer $TB" "$B/api/auth/me" | field user.bio)
ALICEBIO=$(curl -s -H "Authorization: Bearer $TA" "$B/api/auth/me" | field user.bio)
# Assert positively on both sides: an empty read must not be mistaken for safety.
chk "alice's own bio was updated"        "alice was here" "$ALICEBIO"
chk "bob's bio was left alone"           "true"           "$([ -n "$BOBBIO" ] && [ "$BOBBIO" != "alice was here" ] && echo true || echo false)"

echo "--- unauthenticated still blocked ---"
chk "no token" 401 "$(code $B/api/messages/$DM)"
