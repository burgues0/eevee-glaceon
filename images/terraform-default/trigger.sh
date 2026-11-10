#!/bin/bash
set -uo pipefail

SRC_PATH=/app/src
TEST_PATH=/app/test

cd "$SRC_PATH" || exit 1

echo "Running terraform init..."
terraform init -input=false -no-color

echo "Running terraform plan..."
terraform plan -input=false -no-color -out=/tmp/tfplan
plan_exit=$?

terraform show -json /tmp/tfplan > /tmp/tfplan.json 2>/dev/null || echo '{}' > /tmp/tfplan.json

if [ "$plan_exit" -eq 0 ]; then
  echo "Running terraform apply..."
  terraform apply -input=false -no-color -json /tmp/tfplan > /tmp/apply.ndjson
  apply_exit=$?

  # -json replaces terraform's own human-readable output; print a short
  # recap so the raw report stays legible.
  jq -r '
    if .type=="diagnostic" then "Error: " + (.diagnostic.summary // "")
    elif .type=="apply_complete" or .type=="apply_errored" then (.hook.resource.addr // "?") + ": " + .type
    else empty end
  ' /tmp/apply.ndjson 2>/dev/null
else
  apply_exit=$plan_exit
  : > /tmp/apply.ndjson
fi

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
# apply como único critério. Trocar quando o Cap5 (Projeto de Ensino) definir
# os critérios reais por exercício.
if [ "$total" -eq 0 ] && [ "$apply_exit" -ne 0 ]; then
  total=1
fi

echo "Tests:       $passed passed, $total total"
echo "Tests run!"

# Resource facts for the "Recursos" tab (GLACEON): declared resources from
# the plan's configuration (so a resource that errors mid-apply still shows
# up), cross-referenced with what apply actually did.
jq -n --slurpfile plan /tmp/tfplan.json --slurpfile applylog /tmp/apply.ndjson '
  (
    ($applylog // [])
    | map(select(.type=="apply_complete" or .type=="apply_errored"))
    | map({(.hook.resource.addr): (if .type=="apply_complete" then "ok" else "error" end)})
    | add // {}
  ) as $status
  | ($plan[0].configuration.root_module.resources // [])
  | map(
      . as $r
      | {
          id: $r.address,
          category: (
            if ($r.type | test("^aws_instance")) then "EC2"
            elif ($r.type | test("^aws_(vpc|subnet|route|internet_gateway|security_group)")) then "Network"
            elif ($r.type | test("^aws_db_")) then "RDS"
            elif ($r.type | test("^aws_s3_")) then "S3"
            else "Outros" end
          ),
          type: $r.type,
          status: ($status[$r.address] // "pending"),
          attributes: (
            ($r.expressions // {}) | to_entries
            | map(select(.value.constant_value != null))
            | map({key: .key, value: (.value.constant_value | tostring)})
          ),
          relatedResources: (
            ($r.expressions // {}) | to_entries
            | map(select(.value.references != null))
            | map({key: .key, value: (.value.references[0] | split(".") | .[0:2] | join("."))})
          )
        }
    )
' > /tmp/resources.json 2>/dev/null || echo '[]' > /tmp/resources.json

echo "EEVEE_RESOURCES_JSON_START"
cat /tmp/resources.json
echo "EEVEE_RESOURCES_JSON_END"

[ "$passed" -eq "$total" ] && exit 0 || exit 1
