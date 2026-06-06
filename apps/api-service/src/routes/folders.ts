import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { folders, folderMembers, users } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'
import {
  isAdmin,
  isPjm,
  canAccessFolder,
  canManageFolder,
  isProjectManager
} from '../lib/permissions.js'

const CreateFolderBody = z.object({
  name: z.string().min(1).max(255),
  projectId: z.string().uuid(),
})

const UpdateFolderBody = z.object({
  name: z.string().min(1).max(255).optional(),
})

export const foldersRouter: FastifyPluginAsync = async (app) => {
  // GET /folders — list workspace folders
  app.get('/', async (request, reply) => {
    const userIsAdmin = await isAdmin(request)

    const result = await withRls(app.db, request, async (tx) => {
      const allFolders = await tx
        .select()
        .from(folders)
        .where(eq(folders.workspaceId, request.ctx.workspaceId))
        .orderBy(folders.createdAt)

      if (userIsAdmin) return allFolders

      const allowedFolders = []
      for (const folder of allFolders) {
        if (await canAccessFolder(tx, request, folder.id)) {
          allowedFolders.push(folder)
        }
      }
      return allowedFolders
    })

    return { data: result, requestId: request.id }
  })

  // POST /folders — create folder
  app.post('/', async (request, reply) => {
    const body = CreateFolderBody.parse(request.body)

    const userIsAdmin = await isAdmin(request)
    const userIsPjm = await isPjm(app.db, request)
    let userIsManager = userIsAdmin || userIsPjm

    if (!userIsManager) {
      userIsManager = await isProjectManager(app.db, request, body.projectId)
    }

    if (!userIsManager) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Manager role required to create folders', requestId: request.id } })
    }

    const folderId = uuid()

    const [folder] = await withRls(app.db, request, async (tx) => {
      return tx
        .insert(folders)
        .values({
          id: folderId,
          workspaceId: request.ctx.workspaceId,
          projectId: body.projectId,
          name: body.name,
          createdBy: request.ctx.userId,
        } as any)
        .returning()
    })

    reply.code(201)
    return { data: folder, requestId: request.id }
  })

  // PUT /folders/:id — update folder
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = UpdateFolderBody.parse(request.body)

    if (!(await canManageFolder(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: manager privilege required', requestId: request.id } })
    }

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx
        .update(folders)
        .set({
          ...(body.name !== undefined && { name: body.name }),
        } as any)
        .where(and(eq(folders.id, id), eq(folders.workspaceId, request.ctx.workspaceId)))
        .returning(),
    )

    if (!updated) {
      return reply.code(404).send({ error: { code: 'FOLDER_NOT_FOUND', message: `Folder ${id} not found`, requestId: request.id } })
    }

    return { data: updated, requestId: request.id }
  })

  // DELETE /folders/:id — delete folder
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    if (!(await canManageFolder(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: manager privilege required', requestId: request.id } })
    }

    const [deleted] = await withRls(app.db, request, async (tx) =>
      tx
        .delete(folders)
        .where(and(eq(folders.id, id), eq(folders.workspaceId, request.ctx.workspaceId)))
        .returning(),
    )

    if (!deleted) {
      return reply.code(404).send({ error: { code: 'FOLDER_NOT_FOUND', message: `Folder ${id} not found`, requestId: request.id } })
    }

    reply.code(204)
  })

  // GET /folders/:id/members — get folder members
  app.get('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!(await canAccessFolder(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    const result = await withRls(app.db, request, async (tx) => {
      return tx
        .select({
          userId: folderMembers.userId,
          name: users.name,
          email: users.email,
        })
        .from(folderMembers)
        .innerJoin(users, eq(users.id, folderMembers.userId))
        .where(eq(folderMembers.folderId, id))
    })
    return { data: result, requestId: request.id }
  })

  // PUT /folders/:id/members — update folder members
  app.put('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      userIds: z.array(z.string().uuid())
    }).parse(request.body)

    if (!(await canManageFolder(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: manager privilege required' } })
    }

    await withRls(app.db, request, async (tx) => {
      await tx.delete(folderMembers).where(eq(folderMembers.folderId, id))
      if (body.userIds.length > 0) {
        await tx.insert(folderMembers).values(
          body.userIds.map(userId => ({
            folderId: id,
            userId,
          }))
        )
      }
    })
    return { success: true, requestId: request.id }
  })
}
