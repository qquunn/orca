import { describe, expect, it } from 'vitest'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getMergeTargetCandidates } from './merge-target-candidates'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo::/workspaces/child',
    instanceId: 'child-instance',
    repoId: 'repo',
    path: '/workspaces/child',
    head: 'abc',
    branch: 'refs/heads/feature/child',
    isBare: false,
    isMainWorktree: false,
    isSparse: false,
    displayName: 'Child worktree',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

function makeLineage(taskId: string): WorktreeLineage {
  return {
    worktreeId: 'repo::/workspaces/orchestrated',
    worktreeInstanceId: 'orchestrated-instance',
    parentWorktreeId: 'repo::/workspaces/main',
    parentWorktreeInstanceId: 'main-instance',
    origin: 'orchestration',
    capture: { source: 'orchestration-context', confidence: 'explicit' },
    taskId,
    createdAt: 0
  }
}

describe('getMergeTargetCandidates', () => {
  const child = makeWorktree()
  const parent = makeWorktree({
    id: 'repo::/workspaces/parent',
    displayName: 'Parent worktree',
    branch: 'refs/heads/main'
  })

  it('puts the parent workspace first without requiring a task link', () => {
    const candidates = getMergeTargetCandidates({
      child,
      parentWorktree: parent,
      worktrees: [child, parent],
      lineageById: {}
    })

    expect(candidates.map((candidate) => candidate.worktree.id)).toEqual([parent.id])
    expect(candidates[0]).toMatchObject({ isParent: true, taskSource: null })
  })

  it('includes all branch-bearing repo worktrees, tagging task links where present', () => {
    const orchestrated = makeWorktree({
      id: 'repo::/workspaces/orchestrated',
      displayName: 'Orchestrated',
      branch: 'refs/heads/feature/orchestrated'
    })
    const issueLinked = makeWorktree({
      id: 'repo::/workspaces/issue',
      displayName: 'Issue-linked',
      branch: 'refs/heads/feature/issue',
      linkedIssue: 42
    })
    const sourceLinked = makeWorktree({
      id: 'repo::/workspaces/source',
      displayName: 'Source-linked',
      branch: 'refs/heads/feature/source',
      linkedTaskSourceContext: {
        kind: 'task-source',
        provider: 'linear',
        projectId: 'project',
        hostId: 'local'
      }
    })
    const unlinked = makeWorktree({
      id: 'repo::/workspaces/unlinked',
      displayName: 'Unlinked',
      branch: 'refs/heads/feature/unlinked'
    })

    const candidates = getMergeTargetCandidates({
      child,
      parentWorktree: null,
      worktrees: [unlinked, issueLinked, orchestrated, sourceLinked, child],
      lineageById: { [orchestrated.id]: makeLineage('task-1') }
    })

    expect(candidates.map((candidate) => candidate.worktree.id)).toEqual([
      issueLinked.id,
      orchestrated.id,
      sourceLinked.id,
      unlinked.id
    ])
    expect(candidates.map((candidate) => candidate.taskSource?.kind)).toEqual([
      'issue',
      'orchestration-task',
      'task-source',
      undefined
    ])
  })

  it('skips candidates from another repo, archived candidates, and those without a branch', () => {
    const otherRepo = makeWorktree({
      id: 'other::/workspaces/other',
      repoId: 'other',
      displayName: 'Other repo',
      linkedIssue: 1
    })
    const archived = makeWorktree({
      id: 'repo::/workspaces/archived',
      displayName: 'Archived',
      linkedIssue: 2,
      isArchived: true
    })
    const detached = makeWorktree({
      id: 'repo::/workspaces/detached',
      displayName: 'Detached',
      linkedIssue: 3,
      branch: ''
    })

    const candidates = getMergeTargetCandidates({
      child,
      parentWorktree: null,
      worktrees: [otherRepo, archived, detached],
      lineageById: {}
    })

    expect(candidates).toEqual([])
  })

  it('does not duplicate a parent that also carries a task link', () => {
    const issueParent = makeWorktree({
      id: 'repo::/workspaces/issue-parent',
      displayName: 'Issue parent',
      branch: 'refs/heads/main',
      linkedIssue: 7
    })

    const candidates = getMergeTargetCandidates({
      child,
      parentWorktree: issueParent,
      worktrees: [child, issueParent],
      lineageById: {}
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      isParent: true,
      taskSource: { kind: 'issue', number: 7 }
    })
  })

  it('marks the worktree checked out on the create base as the source-branch shortcut', () => {
    const fromMain = makeWorktree({ baseRef: 'origin/main' })
    const main = makeWorktree({
      id: 'repo::/workspaces/main',
      displayName: 'Main',
      branch: 'refs/heads/main'
    })
    const unrelated = makeWorktree({
      id: 'repo::/workspaces/unrelated',
      displayName: 'Aaa unrelated',
      branch: 'refs/heads/feature/other'
    })

    const candidates = getMergeTargetCandidates({
      child: fromMain,
      parentWorktree: null,
      worktrees: [unrelated, main, fromMain],
      lineageById: {}
    })

    expect(candidates.map((candidate) => candidate.worktree.id)).toEqual([main.id, unrelated.id])
    expect(candidates[0]).toMatchObject({ isSourceBranch: true })
    expect(candidates[1]).toMatchObject({ isSourceBranch: false })
  })

  it('prefers an exact branch match over the remote-prefix fallback', () => {
    const fromFeature = makeWorktree({ baseRef: 'feature/topic' })
    const exact = makeWorktree({
      id: 'repo::/workspaces/exact',
      displayName: 'Exact',
      branch: 'refs/heads/feature/topic'
    })
    const tailOnly = makeWorktree({
      id: 'repo::/workspaces/tail',
      displayName: 'Tail',
      branch: 'refs/heads/topic'
    })

    const candidates = getMergeTargetCandidates({
      child: fromFeature,
      parentWorktree: null,
      worktrees: [tailOnly, exact, fromFeature],
      lineageById: {}
    })

    expect(candidates.filter((candidate) => candidate.isSourceBranch)).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ worktree: { id: exact.id }, isSourceBranch: true })
  })
})
