import { describe, it, expect } from 'vitest'
import { evaluateAlerts, type AlertRule, type HAEntity } from '../home-assistant/alertEngine.js'

const makeEntity = (entityId: string, state: string): HAEntity => ({
  entity_id: entityId,
  state,
  attributes: {},
})

const rules: AlertRule[] = [
  { entityId: 'sensor.absol_waste_drawer', condition: { type: 'numericAbove', threshold: 80 }, taskTitle: "Empty Absol's litter box", priority: 'high' },
  { entityId: 'sensor.absol_hopper_status', condition: { type: 'notEquals', value: 'enabled' }, taskTitle: "Check Absol's hopper", priority: 'medium' },
  { entityId: 'binary_sensor.roborock_s7_maxv_water_shortage', condition: { type: 'isOn' }, taskTitle: 'Refill S7 water tank', priority: 'high' },
  { entityId: 'sensor.front_doorbell_battery', condition: { type: 'numericBelow', threshold: 10 }, taskTitle: 'Charge front doorbell battery', priority: 'high' },
]

describe('evaluateAlerts', () => {
  it('triggers numericAbove when state exceeds threshold', () => {
    const entities = [makeEntity('sensor.absol_waste_drawer', '85')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe("Empty Absol's litter box")
  })

  it('does not trigger numericAbove when state is below threshold', () => {
    const entities = [makeEntity('sensor.absol_waste_drawer', '60')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('triggers isOn when binary sensor is on', () => {
    const entities = [makeEntity('binary_sensor.roborock_s7_maxv_water_shortage', 'on')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe('Refill S7 water tank')
  })

  it('does not trigger isOn when binary sensor is off', () => {
    const entities = [makeEntity('binary_sensor.roborock_s7_maxv_water_shortage', 'off')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('triggers notEquals when state differs', () => {
    const entities = [makeEntity('sensor.absol_hopper_status', 'empty')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe("Check Absol's hopper")
  })

  it('does not trigger notEquals when state matches', () => {
    const entities = [makeEntity('sensor.absol_hopper_status', 'enabled')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('triggers numericBelow when state is below threshold', () => {
    const entities = [makeEntity('sensor.front_doorbell_battery', '8')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe('Charge front doorbell battery')
  })

  it('does not trigger for unknown entity', () => {
    const entities: HAEntity[] = []
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('returns multiple triggered alerts', () => {
    const entities = [
      makeEntity('sensor.absol_waste_drawer', '85'),
      makeEntity('binary_sensor.roborock_s7_maxv_water_shortage', 'on'),
    ]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(2)
  })

  it('triggers stateToTitle with correct title for mapped state', () => {
    const dockErrorRule: AlertRule = {
      entityId: 'sensor.s8_maxv_ultra_dock_dock_error',
      condition: {
        type: 'stateToTitle',
        mapping: {
          'ok': '',
          'water_empty': 'Refill S8 clean water tank',
          'waste_water_tank_full': 'Empty S8 dirty water tank',
          'duct_blockage': 'Check S8 dock for duct blockage',
        },
      },
      priority: 'high',
    }
    const entities = [makeEntity('sensor.s8_maxv_ultra_dock_dock_error', 'water_empty')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts([dockErrorRule], map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe('Refill S8 clean water tank')
  })

  it('does not trigger stateToTitle when state is ok', () => {
    const dockErrorRule: AlertRule = {
      entityId: 'sensor.s8_maxv_ultra_dock_dock_error',
      condition: {
        type: 'stateToTitle',
        mapping: {
          'ok': '',
          'water_empty': 'Refill S8 clean water tank',
        },
      },
      priority: 'high',
    }
    const entities = [makeEntity('sensor.s8_maxv_ultra_dock_dock_error', 'ok')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts([dockErrorRule], map)
    expect(triggered).toHaveLength(0)
  })

  it('does not trigger stateToTitle for unmapped state', () => {
    const dockErrorRule: AlertRule = {
      entityId: 'sensor.s8_maxv_ultra_dock_dock_error',
      condition: {
        type: 'stateToTitle',
        mapping: {
          'ok': '',
          'water_empty': 'Refill S8 clean water tank',
        },
      },
      priority: 'high',
    }
    const entities = [makeEntity('sensor.s8_maxv_ultra_dock_dock_error', 'unknown_error')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts([dockErrorRule], map)
    expect(triggered).toHaveLength(0)
  })
})
