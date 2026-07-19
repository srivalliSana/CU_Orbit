#!/bin/bash
# Group creation: creator is the session user, members are added, and a
# non-member cannot read the private group.
B=http://localhost:3000
# role is the 3rd arg; group creation is staff-only so Ann signs in as faculty.
mk() { node -e "console.log(require('jsonwebtoken').sign({sub:'x',email:'$1',name:'$2',role:'${3:-student}'},'test-campus-secret',{algorithm:'HS256',expiresIn:300,audience:'cu-orbit'}))"; }
field() { node -pe 'const o=JSON.parse(require("fs").readFileSync(0)||"{}");process.argv[1].split(".").reduce((a,k)=>a&&a[k],o)??""' "$1" 2>/dev/null; }
P=0; F=0
chk(){ [ "$2" = "$3" ] && { echo "  PASS  $1 (got $3)"; P=$((P+1)); } || { echo "  FAIL  $1 (want $2, got $3)"; F=$((F+1)); }; }

for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' $B/api/health)" = "200" ] && break; sleep 1; done

SA=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk ann@cutm.ac.in Ann faculty)\"}")
SB=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk ben@cutm.ac.in Ben)\"}")
SC=$(curl -s -X POST $B/api/auth/sso -H 'Content-Type: application/json' -d "{\"token\":\"$(mk cid@cutm.ac.in Cid)\"}")
TA=$(echo "$SA"|field session); IA=$(echo "$SA"|field user.id)
TB=$(echo "$SB"|field session); IB=$(echo "$SB"|field user.id)
TC=$(echo "$SC"|field session)

G=$(curl -s -X POST $B/api/workspaces/default/channels -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Project Team\",\"type\":\"private\",\"members\":[\"$IB\"]}")
GID=$(echo "$G"|field id)
chk "group created"            "true"          "$([ -n "$GID" ] && echo true || echo false)"
# Without this, a failed creation leaves every later assertion chasing an empty
# id and the real reason never appears.
[ -n "$GID" ] || echo "      server said: $(echo "$G" | head -c 300)"
chk "creator recorded as Ann"  "$IA"           "$(echo "$G"|field created_by)"
chk "member_count is 2"        "2"             "$(echo "$G"|field member_count)"

chk "creator can post"  200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/messages -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"body\":\"hello team\",\"channelId\":\"$GID\"}")"
chk "added member can read" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TB" $B/api/messages/$GID)"
chk "outsider cannot read"  403 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TC" $B/api/messages/$GID)"
chk "outsider cannot post"  403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/messages -H "Authorization: Bearer $TC" -H 'Content-Type: application/json' -d "{\"body\":\"intruding\",\"channelId\":\"$GID\"}")"
chk "group appears in creator's list" "true" "$(curl -s -H "Authorization: Bearer $TA" $B/api/home/me/default | grep -c "Project Team" | sed 's/^0$/false/;s/^[1-9].*/true/')"
chk "student cannot create a group" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/workspaces/default/channels -H "Authorization: Bearer $TB" -H 'Content-Type: application/json' -d '{"name":"Student Group"}')"
chk "empty name rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/workspaces/default/channels -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"name":"  "}')"

echo; echo "$P passed, $F failed"; [ $F -eq 0 ] || exit 1
