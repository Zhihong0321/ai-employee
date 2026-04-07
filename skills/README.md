# Skill Packages

This directory holds internal planning skills for the local agent framework.

Skill package format:

- `skills/<skill-id>/skill.json`
- `skills/<skill-id>/SKILL.md`

Runtime rules in v1:

- skills are planning guidance only
- skills do not execute tools directly
- reloading packages stores new versions as drafts
- a skill version is used only after explicit activation through the skill registry admin API
- `always` skills are injected even without a text match, but should stay rare
- `requires` gating keeps blocked skills visible in debug while excluding them from planner selection

Suggested `skill.json` shape:

```json
{
  "skillId": "sales-followup",
  "name": "Sales Follow-up",
  "description": "Guides branch sales follow-up planning.",
  "tags": ["sales", "followup"],
  "domains": ["sales"],
  "triggers": ["daily sales report"],
  "allowedTools": ["create_task", "schedule_wakeup"],
  "priority": 2,
  "always": false,
  "requires": {
    "bins": [],
    "env": []
  },
  "status": "draft"
}
```
