from __future__ import annotations

import json

from ansible.plugins.callback import CallbackBase

DOCUMENTATION = """
callback: glaceon_json
type: stdout
short_description: Dumps one JSON blob with per-task results for GLACEON's "Recursos" tab.
description:
  - ansible-core no longer ships a builtin json stdout callback (moved to the
    community.general collection); this is a minimal in-tree replacement so
    the Terraform/Ansible worker images don't need that whole collection.
"""


class CallbackModule(CallbackBase):
    CALLBACK_VERSION = 2.0
    CALLBACK_TYPE = "stdout"
    CALLBACK_NAME = "glaceon_json"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.results = {"plays": []}
        self._current_play = {"play": {"name": None}, "tasks": []}

    def v2_playbook_on_play_start(self, play):
        self._current_play = {"play": {"name": play.get_name()}, "tasks": []}
        self.results["plays"].append(self._current_play)

    def _record(self, result, status):
        host_name = result._host.get_name()
        res = result._result

        self._current_play["tasks"].append(
            {
                "task": {"name": result._task.get_name()},
                "hosts": {
                    host_name: {
                        "action": getattr(result._task, "action", "unknown"),
                        "changed": bool(res.get("changed", False)),
                        "failed": status == "failed",
                        "skipped": status == "skipped",
                        "msg": res.get("msg"),
                        "stdout": res.get("stdout"),
                        "stderr": res.get("stderr"),
                    }
                },
            }
        )

    def v2_runner_on_ok(self, result, **kwargs):
        self._record(result, "ok")

    def v2_runner_on_failed(self, result, ignore_errors=False, **kwargs):
        self._record(result, "failed")

    def v2_runner_on_skipped(self, result, **kwargs):
        self._record(result, "skipped")

    def v2_runner_on_unreachable(self, result, **kwargs):
        self._record(result, "failed")

    def v2_playbook_on_stats(self, stats):
        print(json.dumps(self.results))
