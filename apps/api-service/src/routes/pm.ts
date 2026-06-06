import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { projectAssignments, users } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { eq } from 'drizzle-orm'
import { isAdmin, isPjm, canAccessProject, isProjectManager, canManageProject } from '../lib/permissions.js'


/**
 * PM routes proxy to the Go PM Service (M5) via gRPC-gateway HTTP.
 * The gRPC gateway is exposed at http://pm-service:8080 internally.
 */
export const pmRouter: FastifyPluginAsync = async (app) => {
  const PM_URL = `http://${env.PM_GRPC_HOST.replace(':50051', ':8080')}`

  const proxy = async (request: import('fastify').FastifyRequest, path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${PM_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': request.ctx.workspaceId,
        'X-User-Id': request.ctx.userId,
        'X-User-Role': request.ctx.role,
        'X-Client-Cert-CN': 'api-service',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'PM service error' })) as { message?: string }
      throw Object.assign(new Error(err.message ?? 'PM service error'), { statusCode: response.status })
    }

    return response.json()
  }

  // GET /projects
  app.get('/', async (request) => proxy(request, '/v1/projects'))

  // POST /projects
  app.post('/', async (request, reply) => {
    const userIsAdmin = await isAdmin(request)
    const userIsPjm = await isPjm(app.db, request)
    if (!userIsAdmin && !userIsPjm) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Only Admin or Workspace PjM can create projects' } })
    }
    return proxy(request, '/v1/projects', 'POST', request.body)
  })

  // GET /projects/:projectId/tasks
  app.get('/:projectId/tasks', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/tasks`)
  })

  // POST /projects/:projectId/tasks
  app.post('/:projectId/tasks', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/tasks`, 'POST', request.body)
  })

  // GET /projects/:projectId/critical-path
  app.get('/:projectId/critical-path', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/critical-path`)
  })

  // POST /projects/:projectId/baseline
  app.post('/:projectId/baseline', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/baseline`, 'POST', request.body)
  })

  // GET /projects/:projectId/approvals
  app.get('/:projectId/approvals/:rowId', async (request) => {
    const { rowId } = request.params as { rowId: string }
    return proxy(request, `/v1/approvals/${rowId}`)
  })

  // POST /projects/:projectId/approvals/:rowId
  app.post('/:projectId/approvals/:rowId', async (request) => {
    const { rowId } = request.params as { rowId: string }
    return proxy(request, `/v1/approvals/${rowId}`, 'POST', request.body)
  })

  // GET /projects/:projectId/time
  app.get('/:projectId/time', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/reports/time-by-project?projectId=${projectId}`)
  })

  // GET /projects/:projectId/resources
  app.get('/:projectId/resources', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/resources`)
  })

  // POST /projects/:projectId/resources
  app.post('/:projectId/resources', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/resources`, 'POST', request.body)
  })

  // GET /projects/:projectId/rollup
  app.get('/:projectId/rollup', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return proxy(request, `/v1/projects/${projectId}/rollup`)
  })

  // POST /projects/time
  app.post('/time', async (request) => {
    return proxy(request, '/v1/time', 'POST', request.body)
  })

  // GET /projects/:projectId/members
  app.get('/:projectId/members', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    const result = await withRls(app.db, request, async (tx) => {
      return tx
        .select({
          userId: projectAssignments.userId,
          role: projectAssignments.role,
          name: users.name,
          email: users.email,
        })
        .from(projectAssignments)
        .innerJoin(users, eq(users.id, projectAssignments.userId))
        .where(eq(projectAssignments.projectId, projectId))
    })
    return { data: result, requestId: request.id }
  })

  // PUT /projects/:projectId/members
  app.put('/:projectId/members', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = z.object({
      members: z.array(z.object({
        userId: z.string().uuid(),
        role: z.enum(['MANAGER', 'MEMBER']),
      }))
    }).parse(request.body)

    const userIsAdmin = await isAdmin(request)
    const userIsPjm = await isPjm(app.db, request)
    const userIsPM = await isProjectManager(app.db, request, projectId)
    if (!userIsAdmin && !userIsPjm && !userIsPM) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Admin, PjM, or Project Manager privilege required' } })
    }

    await withRls(app.db, request, async (tx) => {
      await tx.delete(projectAssignments).where(eq(projectAssignments.projectId, projectId))
      if (body.members.length > 0) {
        await tx.insert(projectAssignments).values(
          body.members.map(m => ({
            projectId,
            userId: m.userId,
            role: m.role,
          }))
        )
      }
    })
    return { success: true, requestId: request.id }
  })

  // PUT /projects/:projectId/tasks/:taskId
  app.put('/:projectId/tasks/:taskId', async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    return proxy(request, `/v1/projects/${projectId}/tasks/${taskId}`, 'PUT', request.body)
  })

  // POST /projects/:projectId/tasks/:taskId/cascade
  app.post('/:projectId/tasks/:taskId/cascade', async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    return proxy(request, `/v1/projects/${projectId}/tasks/${taskId}/cascade`, 'POST', request.body)
  })

  // GET /projects/:projectId/baselines
  app.get('/:projectId/baselines', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    return proxy(request, `/v1/projects/${projectId}/baselines`)
  })

  // GET /projects/:projectId/baselines/:baselineId
  app.get('/:projectId/baselines/:baselineId', async (request, reply) => {
    const { projectId, baselineId } = request.params as { projectId: string; baselineId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    return proxy(request, `/v1/projects/${projectId}/baselines/${baselineId}`)
  })

  // POST /projects/:projectId/templates/:templateId
  app.post('/:projectId/templates/:templateId', async (request, reply) => {
    const { projectId, templateId } = request.params as { projectId: string; templateId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    return proxy(request, `/v1/projects/${projectId}/templates/${templateId}`, 'POST', request.body)
  })

  // DELETE /projects/:projectId/tasks/:taskId/dependencies/:depId
  app.delete('/:projectId/tasks/:taskId/dependencies/:depId', async (request, reply) => {
    const { projectId, taskId, depId } = request.params as { projectId: string; taskId: string; depId: string }
    if (!(await canAccessProject(app.db, request, projectId))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
    }
    await proxy(request, `/v1/projects/${projectId}/tasks/${taskId}/dependencies/${depId}`, 'DELETE')
    return reply.code(204).send()
  })

  // DELETE /projects/:projectId
  app.delete('/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }

    const userIsAdmin = await isAdmin(request)
    const canManage = userIsAdmin || (await canManageProject(app.db, request, projectId))
    if (!canManage) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only Admin or the Project Creator can delete this project',
          requestId: request.id,
        },
      })
    }

    await withRls(app.db, request, async (tx) => {
      // 1. Delete all sheets belonging to this project first
      await tx.execute(
        `DELETE FROM sheets WHERE project_id = '${projectId}' AND workspace_id = '${request.ctx.workspaceId}'`
      )
      // 2. Delete the project itself
      await tx.execute(
        `DELETE FROM pm.projects WHERE id = '${projectId}' AND workspace_id = '${request.ctx.workspaceId}'`
      )
    })

    reply.code(204)
  })
}
