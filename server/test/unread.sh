#!/bin/bash
# Unread counts must be per-user. Message.status is one value for the whole
# message and only flips once everyone has read, so a group read must not
# depend on it.
#
#   DB_NAME=cu_orbit_test DB_SYNC=alter CAMPUS_JWT_SECRET=test-campus-secret \
#     ORBIT_JWT_SECRET=test-orbit-secret node server.js > /tmp/orbit.log 2>&1 &
#   ./test/unread.sh
set -u
B=http://localhost:3000
mk() { node -e "console.log(require('jsonwebtoken').sign({sub:'x',email:'$1',name:'$2',role:'${3:-student}'},'test-campus-secret',{algorithm:'HS256',expiresIn:300,audience:'cu-orbit'}))"; }
field() { node -pe 'const o=JSON.parse(require("fs").readFileSync(0)||"{}");process.argv[1].split(".").reduce((a,k)=>a&&a[k],o)??""' "$1" 2>/dev/null; }
P=0; F=0
chk(){ [ "$2" = "$3" ] && { echo "  PASS  $1 (got $3)"; P=$((P+1)); } || { echo "  FAIL  $1 (want $2, got $3)"; F=$((F+1)); }; }

for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' $B/api/health)" = "200" ] && break; sleep 1; done

SA=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk ua@cutm.ac.in UA faculty)\"}")
SB=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk ub@cutm.ac.in UB)\"}")
SC=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk uc@cutm.ac.in UC)\"}")
TA=$(echo "$SA"|field session); IA=$(echo "$SA"|field user.id)
TB=$(echo "$SB"|field session); IB=$(echo "$SB"|field user.id)
TC=$(echo "$SC"|field session); IC=$(echo "$SC"|field user.id)
[ -n "$TA" ] && [ -n "$TB" ] || { echo "PRECONDITION FAILED: sign-in"; exit 1; }

unread() {
  local body; body=$(curl -s -H "Authorization: Bearer $1" $B/api/unread)
  local err; err=$(echo "$body" | field error)
  # /api/unread used to swallow failures and report zero; never let that pass
  # silently again.
  [ -n "$err" ] && echo "      !! /api/unread failed: $(echo "$body" | head -c 200)" >&2
  echo "$body" | field total
}

send() { # token containerId text -> asserts the send worked
  local body; body=$(curl -s -X POST $B/api/messages -H "Authorization: Bearer $1" \
      -H 'Content-Type: application/json' -d "{\"body\":\"$3\",\"channelId\":\"$2\"}")
  local id; id=$(echo "$body" | field id)
  if [ -z "$id" ]; then
    echo "PRECONDITION FAILED: message not sent — $(echo "$body" | head -c 250)" >&2
    exit 1
  fi
}

echo "--- direct message ---"
DM="$(printf '%s\n%s' "$IA" "$IB" | sort | tr '\n' '_' | sed 's/_$//')"
BEFORE=$(unread "$TB")
send "$TA" "$DM" "hi"
chk "recipient's unread rises"        "$((BEFORE+1))" "$(unread "$TB")"
chk "sender's own message is not unread" "0"          "$(unread "$TA")"
curl -s -o /dev/null -X POST "$B/api/conversations/$DM/read" -H "Authorization: Bearer $TB" -H 'Content-Type: application/json' -d '{}'
chk "clears after reading"            "0"             "$(unread "$TB")"

echo "--- group: one member reading must not clear it for the other ---"
G=$(curl -s -X POST $B/api/workspaces/default/channels -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Unread Test $RANDOM\",\"members\":[\"$IB\",\"$IC\"]}")
GID=$(echo "$G"|field id)
[ -n "$GID" ] || { echo "PRECONDITION FAILED: group not created — $(echo "$G"|head -c 200)"; exit 1; }

send "$TA" "$GID" "team"
chk "member B sees it unread" "1" "$(unread "$TB")"
chk "member C sees it unread" "1" "$(unread "$TC")"

curl -s -o /dev/null -X POST "$B/api/conversations/$GID/read" -H "Authorization: Bearer $TB" -H 'Content-Type: application/json' -d '{}'
# The bug: this cleared for nobody, because Message.status only flips once all
# members have read.
chk "clears for B after B reads"        "0" "$(unread "$TB")"
chk "still unread for C who has not"    "1" "$(unread "$TC")"

echo; echo "$P passed, $F failed"
[ $F -eq 0 ] || { echo "UNREAD TEST FAILED"; exit 1; }
echo "All unread checks passed."
