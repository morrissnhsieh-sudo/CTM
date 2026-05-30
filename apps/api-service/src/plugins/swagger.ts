import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

export const swaggerPlugin = fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'CTM Platform API',
        description: 'Collaborative AI Spreadsheet Platform — Smartsheet-compatible REST API',
        version: '1.0.0',
      },
      servers: [{ url: 'https://api.ctm.app', description: 'Production' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          patToken: { type: 'apiKey', in: 'header', name: 'Authorization' },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Workspaces' },
        { name: 'Sheets' },
        { name: 'Rows' },
        { name: 'Columns' },
        { name: 'Cells' },
        { name: 'AI' },
        { name: 'PM' },
        { name: 'Search' },
        { name: 'Webhooks' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/v1/docs',
    uiConfig: { deepLinking: false },
  })
})
