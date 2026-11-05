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

  it('includes worktrees linked by taskSourceContext, linkedIssue, and orchestration taskId', () => {
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
      sourceLinked.id
    ])
    expect(candidates.map((candidate) => candidate.taskSource?.kind)).toEqual([
      'issue',
      'orchestration-task',
      'task-source'
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
})
