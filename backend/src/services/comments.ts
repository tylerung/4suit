import { collections, toDomain, toDomainAll, type CommentDoc } from '../db/mongo.js'
import { newId } from '../db/ids.js'
import type { Comment } from '../types.js'
import { forbidden, notFound } from '../lib/errors.js'
import { canViewProfile } from './privacy.js'
import { getPost } from './posts.js'

/** Everyone who can read the post can read its comments — and only them. */
async function requireReadablePost(postId: string, viewerId: string | null): Promise<string> {
  const post = await getPost(postId)
  if (!post) throw notFound('That post is no longer here.')
  if (!(await canViewProfile(viewerId, post.authorId))) {
    throw forbidden('That account is private.')
  }
  return post.authorId
}

export async function listComments(postId: string, viewerId: string | null): Promise<Comment[]> {
  await requireReadablePost(postId, viewerId)
  const docs = await collections.comments()
    .find({ postId })
    .sort({ createdAt: 1 })
    .toArray()
  return toDomainAll(docs)
}

export async function addComment(
  postId: string,
  authorId: string,
  body: string,
): Promise<Comment> {
  await requireReadablePost(postId, authorId)
  const comment: Comment = {
    id: newId('c'),
    postId,
    authorId,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    likedBy: [],
  }
  const { id, ...rest } = comment
  await collections.comments().insertOne({ _id: id, ...rest } as CommentDoc)
  return comment
}

/**
 * A comment can be removed by whoever wrote it, and by whoever owns the post it
 * sits under — the same "it is on my post" authority the UI implies.
 */
export async function deleteComment(commentId: string, actorId: string): Promise<void> {
  const doc = await collections.comments().findOne({ _id: commentId })
  if (!doc) return
  const comment = toDomain(doc)
  if (comment.authorId !== actorId) {
    const post = await getPost(comment.postId)
    if (post?.authorId !== actorId) throw forbidden('That comment is not yours.')
  }
  await collections.comments().deleteOne({ _id: commentId })
}

export async function toggleCommentLike(commentId: string, userId: string): Promise<Comment> {
  const doc = await collections.comments().findOne({ _id: commentId })
  if (!doc) throw notFound('That comment is no longer here.')
  const comment = toDomain(doc)
  await requireReadablePost(comment.postId, userId)
  await collections.comments().updateOne(
    { _id: commentId },
    comment.likedBy.includes(userId)
      ? { $pull: { likedBy: userId } }
      : { $addToSet: { likedBy: userId } },
  )
  const updated = await collections.comments().findOne({ _id: commentId })
  return toDomain(updated!)
}
