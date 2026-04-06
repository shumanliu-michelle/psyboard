import type { HAEntity } from './haClient.js'

export type AlertCondition =
  | { type: 'numericAbove'; threshold: number }
  | { type: 'numericBelow'; threshold: number }
  | { type: 'notEquals'; value: string }
  | { type: 'isOn' }

export type AlertRule = {
  entityId: string
  condition: AlertCondition
  taskTitle: string
  priority: 'high' | 'medium'
}

export type TriggeredAlert = {
  entityId: string
  state: string
  taskTitle: string
  priority: 'high' | 'medium'
}

/**
 * Evaluate all alert rules against a map of entity states.
 * Returns only the alerts whose conditions are met.
 */
export function evaluateAlerts(
  rules: AlertRule[],
  entityMap: Map<string, HAEntity>
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = []

  for (const rule of rules) {
    const entity = entityMap.get(rule.entityId)
    if (!entity) continue // entity not found in HA — skip silently

    if (evaluateCondition(rule.condition, entity.state)) {
      triggered.push({
        entityId: rule.entityId,
        state: entity.state,
        taskTitle: rule.taskTitle,
        priority: rule.priority,
      })
    }
  }

  return triggered
}

function evaluateCondition(condition: AlertCondition, state: string): boolean {
  switch (condition.type) {
    case 'numericAbove':
      return parseFloat(state) > condition.threshold
    case 'numericBelow':
      return parseFloat(state) < condition.threshold
    case 'notEquals':
      return state !== condition.value
    case 'isOn':
      return state === 'on'
  }
}
