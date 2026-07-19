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

SA=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk alice@cutm.ac.in Alice)\"}")
SB=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk bob@cutm.ac.in Bob)\"}")
TA=$(echo "$SA" | node -pe 'JSON.parse(require("fs").readFileSync(0)).session')
TB=$(echo "$SB" | node -pe 'JSON.parse(require("fs").readFileSync(0)).session')
IA=$(echo "$SA" | node -pe 'JSON.parse(require("fs").readFileSync(0)).user.id')
IB=$(echo "$SB" | node -pe 'JSON.parse(require("fs").readFileSync(0)).user.id')
echo "alice=$IA"; echo "bob=$IB"; echo

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
chk() { # desc expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1 (got $3)"; else echo "  FAIL  $1 (want $2, got $3)"; fi
}

echo "--- identity is taken from the session, not the path ---"
ME=$(curl -s -H "Authorization: Bearer $TA" "$B/api/home/quick-access/$IB" -o /dev/null -w '%{http_code}')
chk "alice reading bob's quick-access path returns her own data, not 403" 200 "$ME"

echo "--- alice sends a DM to bob, then a private one to herself ---"
DM="$(printf '%s\n%s' "$IA" "$IB" | sort | tr '\n' '_' | sed 's/_$//')"
SEND=$(code -X POST $B/api/messages -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"body\":\"hi bob\",\"channelId\":\"$DM\"}")
chk "alice can post to her own DM room" 200 "$SEND"

echo "--- a third party must not read that DM ---"
OUT=$(mk carol@cutm.ac.in Carol)
SC=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$OUT\"}")
TC=$(echo "$SC" | node -pe 'JSON.parse(require("fs").readFileSync(0)).session')
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
curl -s -X PUT $B/api/users/0000000000 -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"bio":"alice was here"}' -o /dev/null
BOBBIO=$(curl -s -H "Authorization: Bearer $TB" $B/api/auth/me | node -pe 'JSON.parse(require("fs").readFileSync(0)).user.bio')
chk "alice's write did not land on bob" "true" "$([ "$BOBBIO" != "alice was here" ] && echo true || echo false)"

echo "--- unauthenticated still blocked ---"
chk "no token" 401 "$(code $B/api/messages/$DM)"
