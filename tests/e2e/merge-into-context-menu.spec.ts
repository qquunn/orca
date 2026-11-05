import { execFileSync } from 'node:child_process'
import { test, expect } from './helpers/orca-app'
import { addRepoWithWorkspaces, linkWorkspaces } from './helpers/repo-with-workspaces'
import { waitForSessionReady } from './helpers/store'
import { worktreeRow } from './worktree-row-locators'

test.describe('Worktree merge-into context menu', () => {
  test('merges a child branch into its parent workspace and shows the success toast', async ({
    orcaPage
  }, testInfo) => {
    test.setTimeout(120_000)
    await waitForSessionReady(orcaPage)

    const repo = await addRepoWithWorkspaces(orcaPage, testInfo, 2)
    const [parentId, childId] = [repo.ids[0]!, repo.ids[1]!]
    await linkWorkspaces(orcaPage, [{ childId, parentId }])
    await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      state.setSidebarOpen(true)
      state.setGroupBy('none')
      state.setSortBy('recent')
      state.setShowActiveOnly(false)
      state.setShowSleepingWorkspaces(true)
      state.setHideDefaultBranchWorkspace(false)
      state.setFilterRepoIds([])
    })

    // Land a child-only commit so the merge has a real delta.
    const { childPath } = await orcaPage.evaluate(
      ({ parentId, childId }) => {
        const state = window.__store!.getState()
        const byId = (id: string) =>
          Object.values(state.worktreesByRepo)
            .flat()
            .find((worktree) => worktree.id === id)!
        return { parentPath: byId(parentId).path, childPath: byId(childId).path }
      },
      { parentId, childId }
    )
    execFileSync('git', ['config', 'user.name', 'E2E'], { cwd: childPath })
    execFileSync('git', ['config', 'user.email', 'e2e@test.local'], { cwd: childPath })
    execFileSync('sh', ['-c', 'echo merge-e2e >> README.md'], { cwd: childPath })
    execFileSync('git', ['add', 'README.md'], { cwd: childPath })
    execFileSync('git', ['commit', '-m', 'merge e2e child commit'], { cwd: childPath })

    const childRow = worktreeRow(orcaPage, childId)
    await expect(childRow).toBeVisible()
    // The virtualized row re-mounts under watcher churn; right-click needs no precision.
    await childRow.click({ button: 'right', force: true })

    const mergeInto = orcaPage.getByRole('menuitem', { name: 'Merge into…' })
    await expect(mergeInto).toBeVisible()
    // Radix opens submenus on pointer-enter; force skips the mid-mount stability wait.
    await mergeInto.hover({ force: true })
    await orcaPage.waitForTimeout(300)

    const parentItem = orcaPage.getByRole('menuitem', { name: /Parent workspace/ })
    await expect(parentItem).toBeVisible()
    await parentItem.click({ force: true })

    await expect(orcaPage.locator('[data-sonner-toast]')).toContainText(/Merged /, {
      timeout: 15_000
    })

    // The parent checkout now contains the child's commit.
    const parentPath = await orcaPage.evaluate((id) => {
      const state = window.__store!.getState()
      return Object.values(state.worktreesByRepo)
        .flat()
        .find((worktree) => worktree.id === id)!.path
    }, parentId)
    const log = execFileSync('git', ['log', '--oneline', '-1'], {
      cwd: parentPath,
      encoding: 'utf8'
    })
    expect(log).toContain('merge e2e child commit')
  })
})
