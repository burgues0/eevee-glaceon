#!/bin/bash
set -uo pipefail

SRC_PATH=/app/src
TEST_PATH=/app/test

cd "$SRC_PATH" || exit 1

echo "Running terraform init..."
terraform init -input=false -no-color
echo "Running terraform apply..."
terraform apply -auto-approve -input=false -no-color
apply_exit=$?

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

# ponytail: sem scripts de validação ainda definidos por exercício, usa o
# exit code do apply como único critério. Trocar quando o Cap5 (Projeto de
# Ensino) definir os critérios reais por exercício.
if [ "$total" -eq 0 ] && [ "$apply_exit" -ne 0 ]; then
  total=1
fi

echo "Tests:       $passed passed, $total total"
echo "Tests run!"

[ "$passed" -eq "$total" ] && exit 0 || exit 1
