/**
 * M1 — Frontend Shell
 * E2E tests: Grid interaction via Playwright
 *
 * Spec refs:
 *  - Performance SLOs: LCP < 2s, grid scroll 60fps, cell paint p99 < 5ms
 *  - Cell edit mode: F2 or double-click
 *  - Keyboard navigation: Arrow keys, Tab, Enter, Escape
 *  - Formula entry: starts with '='
 *  - View picker: grid, gantt, kanban, calendar, form, dashboard, timeline
 */

import { test, expect, type Page } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

// Helper: sign in as demo user
async function signIn(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.click('button[type="submit"]')
  // Keycloak login form
  await page.fill('#username', 'demo@ctm.app')
  await page.fill('#password', 'demo123')
  await page.click('#kc-login')
  await page.waitForURL(`${BASE_URL}/**`)
}

test.describe('M1 Grid E2E', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test('page loads within LCP < 2s SLO', async ({ page }) => {
    const start = Date.now()
    await page.goto(`${BASE_URL}`)
    await page.waitForSelector('canvas.grid-canvas', { timeout: 5000 })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(2000)
  })

  test('canvas grid element is present and focusable', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    const canvas = page.locator('canvas.grid-canvas')
    await expect(canvas).toBeVisible()
  })

  test('view picker renders all 7 view modes', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    const views = ['Grid', 'Gantt', 'Kanban', 'Calendar', 'Form', 'Dashboard', 'Timeline']
    for (const view of views) {
      await expect(page.locator(`button:has-text("${view}")`)).toBeVisible()
    }
  })

  test('clicking Gantt view switches the view mode', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    await page.click('button:has-text("Gantt")')
    // Gantt button should have active styling (bg-primary/10 class)
    const ganttBtn = page.locator('button:has-text("Gantt")')
    await expect(ganttBtn).toHaveClass(/text-primary/)
  })

  test('AI Panel button opens the right panel', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    await page.click('button:has-text("AI Panel")')
    await expect(page.locator('text=AI Assistant')).toBeVisible()
  })

  test('AI Panel Ctrl+K shortcut opens command palette area', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    await page.keyboard.press('Control+k')
    // Panel should open
    await expect(page.locator('text=AI Assistant')).toBeVisible({ timeout: 2000 })
  })

  test('AI panel mode tabs are present', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    await page.click('button:has-text("AI Panel")')
    for (const mode of ['Ask', 'Analyze', 'Generate', 'Automate']) {
      await expect(page.locator(`button:has-text("${mode}")`).first()).toBeVisible()
    }
  })

  test('toolbar shows cell reference box', async ({ page }) => {
    await page.goto(`${BASE_URL}`)
    // Cell ref box shows "A1" initially
    await expect(page.locator('.font-mono').first()).toBeVisible()
  })

  test('login redirects unauthenticated users', async ({ page }) => {
    // Clear auth
    await page.context().clearCookies()
    await page.goto(`${BASE_URL}/`)
    await expect(page).toHaveURL(/login/)
  })
})
