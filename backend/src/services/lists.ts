import { collections, toDomain, toDomainAll, type ListDoc } from '../db/mongo.js'
import { newId } from '../db/ids.js'
import type { VenueList } from '../types.js'
import type { ListInput } from '../validation/schemas.js'
import { forbidden, notFound } from '../lib/errors.js'
import { canViewProfile } from './privacy.js'

export async function getListRecord(id: string): Promise<VenueList | null> {
  return toDomain(await collections.lists().findOne({ _id: id }))
}

export async function canViewList(list: VenueList, viewerId: string | null): Promise<boolean> {
  if (viewerId === list.ownerId) return true
  if (!list.isPublic) return false
  return canViewProfile(viewerId, list.ownerId)
}

/** A list, or a 404/403 — a private list is not something to hand out. */
export async function getList(id: string, viewerId: string | null): Promise<VenueList> {
  const list = await getListRecord(id)
  if (!list) throw notFound('That list is no longer here.')
  if (!(await canViewList(list, viewerId))) throw forbidden('That list is private.')
  return list
}

/** Lists owned by `ownerId` that `viewerId` is allowed to see. */
export async function listListsByUser(
  ownerId: string,
  viewerId: string | null,
): Promise<VenueList[]> {
  const isOwner = viewerId === ownerId
  if (!isOwner && !(await canViewProfile(viewerId, ownerId))) return []
  const docs = await collections.lists()
    .find(isOwner ? { ownerId } : { ownerId, isPublic: true })
    .sort({ updatedAt: -1 })
    .toArray()
  return toDomainAll(docs)
}

async function requireOwnList(listId: string, actorId: string): Promise<VenueList> {
  const list = await getListRecord(listId)
  if (!list) throw notFound('That list is no longer here.')
  if (list.ownerId !== actorId) throw forbidden('That list is not yours.')
  return list
}

export async function createList(ownerId: string, input: ListInput): Promise<VenueList> {
  const now = new Date().toISOString()
  const list: VenueList = {
    id: newId('l'),
    ownerId,
    name: input.name.trim() || 'Untitled list',
    description: (input.description ?? '').trim(),
    emoji: input.emoji || '📋',
    isPublic: input.isPublic ?? false,
    venueIds: input.venueIds ?? [],
    createdAt: now,
    updatedAt: now,
  }
  const { id, ...rest } = list
  await collections.lists().insertOne({ _id: id, ...rest } as ListDoc)
  return list
}

export async function updateList(
  listId: string,
  actorId: string,
  patch: Partial<ListInput>,
): Promise<VenueList> {
  const list = await requireOwnList(listId, actorId)
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim() || list.name
  if (patch.description !== undefined) update.description = patch.description.trim()
  if (patch.emoji !== undefined) update.emoji = patch.emoji
  if (patch.isPublic !== undefined) update.isPublic = patch.isPublic
  if (patch.venueIds !== undefined) update.venueIds = patch.venueIds
  await collections.lists().updateOne({ _id: listId }, { $set: update })
  return (await getListRecord(listId))!
}

export async function deleteList(listId: string, actorId: string): Promise<void> {
  await requireOwnList(listId, actorId)
  await collections.lists().deleteOne({ _id: listId })
}

/** Add/remove in one call; returns true when the venue ends up in the list. */
export async function toggleVenueInList(
  listId: string,
  venueId: string,
  actorId: string,
): Promise<{ inList: boolean; list: VenueList }> {
  const list = await requireOwnList(listId, actorId)
  const has = list.venueIds.includes(venueId)
  await collections.lists().updateOne(
    { _id: listId },
    {
      ...(has ? { $pull: { venueIds: venueId } } : { $addToSet: { venueIds: venueId } }),
      $set: { updatedAt: new Date().toISOString() },
    },
  )
  return { inList: !has, list: (await getListRecord(listId))! }
}

export async function reorderList(
  listId: string,
  actorId: string,
  venueId: string,
  direction: -1 | 1,
): Promise<VenueList> {
  const list = await requireOwnList(listId, actorId)
  const i = list.venueIds.indexOf(venueId)
  const j = i + direction
  if (i < 0 || j < 0 || j >= list.venueIds.length) return list
  const next = [...list.venueIds]
  ;[next[i], next[j]] = [next[j], next[i]]
  await collections.lists().updateOne(
    { _id: listId },
    { $set: { venueIds: next, updatedAt: new Date().toISOString() } },
  )
  return (await getListRecord(listId))!
}
