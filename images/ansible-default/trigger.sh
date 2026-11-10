#!/bin/bash
set -uo pipefail

SRC_PATH=/app/src
TEST_PATH=/app/test

cd "$SRC_PATH" || exit 1

playbook=$(find . -maxdepth 2 \( -iname "*.yml" -o -iname "*.yaml" \) | head -n1)
inventory=$(find . -maxdepth 2 \( -iname "hosts*" -o -iname "inventory*" \) | head -n1)

echo "Running ansible-playbook (playbook: $playbook, inventory: ${inventory:-none})..."
# ansible-core dropped the builtin "json" stdout callback (moved to the
# community.general collection); glaceon_json is our own minimal stand-in,
# see /app/callback_plugins.
export ANSIBLE_CALLBACK_PLUGINS=/app/callback_plugins
export ANSIBLE_STDOUT_CALLBACK=glaceon_json
if [ -n "$inventory" ]; then
  ansible-playbook -i "$inventory" "$playbook" > /tmp/ansible.json
else
  ansible-playbook -i "localhost," -c local "$playbook" > /tmp/ansible.json
fi
run_exit=$?

# The json callback replaces ansible's own human-readable output; print a
# short recap so the raw report stays legible.
jq -r '
  (.plays // [])[] as $play
  | ($play.tasks // [])[] as $t
  | ($t.hosts | to_entries[0].value) as $h
  | ($t.task.name // "?") + ": " +
    (if ($h.failed // false) then "failed"
     elif ($h.skipped // false) then "skipped"
     elif ($h.changed // false) then "changed"
     else "ok" end)
' /tmp/ansible.json 2>/dev/null

passed=0
total=0

if [ -d "$TEST_PATH" ]; then
  for test_script in "$TEST_PATH"/*; do
    [ -f "$test_script" ] || continue
    total=$((total + 1))
    chmod +x "$test_script" 2>/dev/null
    if "$test_script"; then
      passed=$((passed + 1))
    fi
  done
fi

# Sem scripts de validação ainda definidos por exercício, usa o exit code do
# ansible-playbook como único critério. Trocar quando o Cap5 (Projeto de
# Ensino) definir os critérios reais por exercício.
if [ "$total" -eq 0 ] && [ "$run_exit" -ne 0 ]; then
  total=1
fi

echo "Tests:       $passed passed, $total total"
echo "Tests run!"

# Resource facts for the "Recursos" tab (GLACEON): one entry per task run,
# grouped under a single "Playbook" category since a submission is one file.
jq '
  [ (.plays // [])[] as $play
    | ($play.tasks // [])[] as $t
    | ($t.hosts | to_entries[0].value) as $h
    | {
        id: ("task_" + ($t.task.id // $t.task.name // "unknown")),
        category: "Playbook",
        type: ($h.action // "unknown"),
        status: (if ($h.failed // false) then "error" elif ($h.skipped // false) then "pending" else "ok" end),
        attributes: [{key: "nome", value: ($t.task.name // "")}],
        relatedResources: [],
        logs: ( $h.msg // $h.stderr // $h.stdout // null )
      }
  ]
' /tmp/ansible.json > /tmp/resources.json 2>/dev/null || echo '[]' > /tmp/resources.json

echo "EEVEE_RESOURCES_JSON_START"
cat /tmp/resources.json
echo "EEVEE_RESOURCES_JSON_END"

[ "$passed" -eq "$total" ] && exit 0 || exit 1
