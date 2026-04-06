// Types for HA API response
export type HAEntity = {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
}

export type HAClientConfig = {
  url: string      // e.g. "http://10.0.0.229:8123"
  token: string
}

/**
 * Fetch all states from Home Assistant.
 * Throws if HA is unreachable or auth fails.
 */
export async function getAllStates(config: HAClientConfig): Promise<HAEntity[]> {
  const url = `${config.url}/api/states`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Home Assistant request failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<HAEntity[]>
}
