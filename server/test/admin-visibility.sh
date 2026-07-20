#!/bin/bash
# Group visibility by role.
#   faculty/student: only groups they belong to
#   admin:           every group in the workspace
#   nobody, admin included: another person's direct messages
set -u
B=http://localhost:3000
mk() { node -e "console.log(require('jsonwebtoken').sign({sub:'x',email:'$1',name:'$2',role:'${3:-student}'},'test-campus-secret',{algorithm:'HS256',expiresIn:300,audience:'cu-orbit'}))"; }
field() { node -pe 'const o=JSON.parse(require("fs").readFileSync(0)||"{}");process.argv[1].split(".").reduce((a,k)=>a&&a[k],o)??""' "$1" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
P=0; F=0
chk(){ [ "$2" = "$3" ] && { echo "  PASS  $1 (got $3)"; P=$((P+1)); } || { echo "  FAIL  $1 (want $2, got $3)"; F=$((F+1)); }; }

for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' $B/api/health)" = "200" ] && break; sleep 1; done

login() { curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk "$1" "$2" "$3")\"}"; }
SF=$(login vf@cutm.ac.in VF faculty);  TF=$(echo "$SF"|field session); IF=$(echo "$SF"|field user.id)
SO=$(login vo@cutm.ac.in VO faculty);  TO=$(echo "$SO"|field session); IO=$(echo "$SO"|field user.id)
SA=$(login va@cutm.ac.in VA admin);    TA=$(echo "$SA"|field session)
SS=$(login vs@cutm.ac.in VS student);  TS=$(echo "$SS"|field session); IS=$(echo "$SS"|field user.id)
[ -n "$TF" ] && [ -n "$TA" ] || { echo "PRECONDITION FAILED: sign-in"; exit 1; }

# A group owned by VF that VO is not in.
NAME="Private Faculty Group $RANDOM"
G=$(curl -s -X POST $B/api/workspaces/default/channels -H "Authorization: Bearer $TF" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$NAME\",\"type\":\"private\"}")
GID=$(echo "$G"|field id)
[ -n "$GID" ] || { echo "PRECONDITION FAILED: group not created — $(echo "$G"|head -c 200)"; exit 1; }

sees() { curl -s -H "Authorization: Bearer $1" "$B/api/home/me/default" | grep -c "$NAME" | sed 's/^0$/no/;s/^[1-9].*/yes/'; }

echo "--- who sees the group in their list ---"
chk "owner sees it"                  "yes" "$(sees "$TF")"
chk "another faculty does not"       "no"  "$(sees "$TO")"
chk "a student does not"             "no"  "$(sees "$TS")"
chk "admin sees every group"         "yes" "$(sees "$TA")"

echo "--- who can open it ---"
chk "owner can read"                 200 "$(code -H "Authorization: Bearer $TF" $B/api/messages/$GID)"
chk "non-member faculty cannot"      403 "$(code -H "Authorization: Bearer $TO" $B/api/messages/$GID)"
chk "student cannot"                 403 "$(code -H "Authorization: Bearer $TS" $B/api/messages/$GID)"
chk "admin can"                      200 "$(code -H "Authorization: Bearer $TA" $B/api/messages/$GID)"

echo "--- direct messages stay private, admin included ---"
DM="$(printf '%s\n%s' "$IF" "$IO" | sort | tr '\n' '_' | sed 's/_$//')"
curl -s -o /dev/null -X POST $B/api/messages -H "Authorization: Bearer $TF" -H 'Content-Type: application/json' -d "{\"body\":\"private\",\"channelId\":\"$DM\"}"
chk "participant can read the DM"    200 "$(code -H "Authorization: Bearer $TO" $B/api/messages/$DM)"
chk "admin CANNOT read a DM"         403 "$(code -H "Authorization: Bearer $TA" $B/api/messages/$DM)"
chk "student cannot read it either"  403 "$(code -H "Authorization: Bearer $TS" $B/api/messages/$DM)"

echo; echo "$P passed, $F failed"
[ $F -eq 0 ] || { echo "VISIBILITY TEST FAILED"; exit 1; }
echo "All visibility checks passed."
