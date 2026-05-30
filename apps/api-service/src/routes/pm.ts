import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'

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
  app.post('/', async (request) => proxy(request, '/v1/projects', 'POST', request.body))

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
}
