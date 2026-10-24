import { getOfflineDB, OutboxItem } from './db'

export async function queueOutboxAction(
  action: OutboxItem['action'],
  payload: any
): Promise<OutboxItem> {
  const db = await getOfflineDB()
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    action,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    client_updated_at: new Date().toISOString(),
  }

  await db.put('outbox', item)
  return item
}

export async function getPendingOutboxItems(): Promise<OutboxItem[]> {
  const db = await getOfflineDB()
  const items = await db.getAllFromIndex('outbox', 'by-created')
  return items
}

export async function removeOutboxItem(id: string): Promise<void> {
  const db = await getOfflineDB()
  await db.delete('outbox', id)
}

export async function incrementOutboxRetry(id: string): Promise<void> {
  const db = await getOfflineDB()
  const item = await db.get('outbox', id)
  if (item) {
    item.retry_count += 1
    await db.put('outbox', item)
  }
}
