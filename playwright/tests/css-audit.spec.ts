/**
 * CSS outlier detection — checks for elements with missing margins,
 * overlapping elements, and other visual layout issues.
 *
 * @e2e
 */
import { test, expect, Page } from '@playwright/test'
import { login, setupErrorCollectors } from './fixtures/auth'

interface LayoutIssue {
  page: string
  selector: string
  issue: string
  detail: string
}

async function checkLayoutIssues(page: Page, pageName: string): Promise<LayoutIssue[]> {
  const issues: LayoutIssue[] = []

  // 1. Check for elements with zero margin-top that follow visible siblings
  //    (common cause of sections butting against each other)
  const marginProblems = await page.evaluate(() => {
    const results: { selector: string; issue: string; detail: string }[] = []
    const visibleElements = document.querySelectorAll<HTMLElement>(
      '.panel, .cockpit-section, .brain-section, .intel-section, .section-title, .page-head, .metric-grid, .ops-kpi-strip, .cockpit-primary, .inherit-card, .warning-card, .error-card, .ops-attention-banner'
    )

    for (const el of visibleElements) {
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      // Check if this element has a previous visible sibling
      let prev = el.previousElementSibling as HTMLElement | null
      while (prev) {
        const prevRect = prev.getBoundingClientRect()
        if (prevRect.height > 0) break
        prev = prev.previousElementSibling as HTMLElement | null
      }

      if (prev) {
        const prevRect = prev.getBoundingClientRect()
        const prevStyle = getComputedStyle(prev)
        const gap = rect.top - prevRect.bottom
        // The gap can come from margin-top, margin-bottom of prev, or
        // the parent's gap property. If gap is < 4px AND the parent
        // doesn't have a gap property, elements are touching.
        const parent = el.parentElement
        const parentGap = parent ? getComputedStyle(parent).gap : '0px'
        const parentGapValue = parseFloat(parentGap) || 0
        if (gap < 4 && gap >= 0 && parentGapValue < 4) {
          const sel = el.className
            ? `.${el.className.split(' ')[0]}`
            : el.tagName.toLowerCase()
          results.push({
            selector: sel,
            issue: 'no-vertical-gap',
            detail: `gap=${gap.toFixed(1)}px between ${prev.tagName.toLowerCase()}.${prev.className.split(' ')[0] ?? ''} and ${sel}`,
          })
        }
      }
    }
    return results
  })

  for (const p of marginProblems) {
    issues.push({ page: pageName, ...p })
  }

  // 2. Check for elements overflowing horizontally
  const overflowProblems = await page.evaluate(() => {
    const results: { selector: string; issue: string; detail: string }[] = []
    const els = document.querySelectorAll<HTMLElement>('.panel, .page, .cockpit-primary, .cockpit-growth-grid, .ops-kpi-strip, .metric-grid')
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      if (rect.right > window.innerWidth + 2) {
        results.push({
          selector: `.${el.className.split(' ')[0]}`,
          issue: 'horizontal-overflow',
          detail: `right=${rect.right.toFixed(0)} viewport=${window.innerWidth}`,
        })
      }
    }
    return results
  })

  for (const p of overflowProblems) {
    issues.push({ page: pageName, ...p })
  }

  // 3. Check for text that is clipped or has zero height
  const clippedText = await page.evaluate(() => {
    const results: { selector: string; issue: string; detail: string }[] = []
    const els = document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, .eyebrow, .pm-title, .pm-desc')
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      if (rect.height === 0 && el.textContent && el.textContent.trim().length > 0) {
        results.push({
          selector: el.tagName.toLowerCase(),
          issue: 'zero-height-text',
          detail: `text="${el.textContent.slice(0, 50)}"`,
        })
      }
    }
    return results
  })

  for (const p of clippedText) {
    issues.push({ page: pageName, ...p })
  }

  // 4. Check for elements with position:relative but no z-index stacking context
  //    that might cause ::before pseudo-elements to overlap content
  const pseudoOverlap = await page.evaluate(() => {
    const results: { selector: string; issue: string; detail: string }[] = []
    const els = document.querySelectorAll<HTMLElement>('.collapsible-section::before, .panel::before')
    // Can't directly check pseudo-elements, but check if panel content
    // is behind the ::before overlay
    const panels = document.querySelectorAll<HTMLElement>('.panel')
    for (const el of panels) {
      const before = getComputedStyle(el, '::before')
      if (before.content !== 'none' && before.pointerEvents === 'none') {
        // OK — pointer-events:none means it won't block clicks
      } else if (before.content !== 'none' && before.pointerEvents !== 'none') {
        results.push({
          selector: '.panel',
          issue: 'pseudo-element-blocking',
          detail: `::before has pointer-events:${before.pointerEvents}`,
        })
      }
    }
    return results
  })

  for (const p of pseudoOverlap) {
    issues.push({ page: pageName, ...p })
  }

  return issues
}

const SUBPAGES = [
  { path: '/', name: 'overview' },
  { path: '/flow', name: 'flow' },
  { path: '/tenants/virya', name: 'tenant-detail' },
  { path: '/tenants/virya/operations', name: 'operations' },
  { path: '/tenants/virya/intelligence', name: 'intelligence' },
  { path: '/tenants/virya/attention', name: 'attention' },
  { path: '/tenants/virya/portfolio', name: 'portfolio' },
  { path: '/tenants/virya/funnel', name: 'growth-funnel' },
]

test.describe('CSS Layout Audit @e2e', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorCollectors(page)
    await login(page)
  })

  for (const sub of SUBPAGES) {
    test(`${sub.name} — no CSS layout outliers @e2e @css`, async ({ page }) => {
      await page.goto(sub.path)
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)

      const issues = await checkLayoutIssues(page, sub.name)
      if (issues.length > 0) {
        console.log(`\n  CSS issues on ${sub.name}:`)
        for (const issue of issues) {
          console.log(`    [${issue.issue}] ${issue.selector}: ${issue.detail}`)
        }
      }
      expect(issues).toEqual([])
    })
  }
})
