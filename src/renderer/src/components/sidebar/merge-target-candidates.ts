import type { TaskProvider } from '../../../../shared/task-providers'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../shared/worktree/types'

export type MergeTargetTaskSource =
  | { kind: 'orchestration-task'; taskId: string }
  | { kind: 'issue'; number: number }
  | { kind: 'task-source'; provider: TaskProvider; projectId: string }

export type MergeTargetCandidate = {
  worktree: Worktree
  isParent: boolean
  /** Checked out branch matches the child's persisted create base (`baseRef`). */
  isSourceBranch: boolean
  taskSource: MergeTargetTaskSource | null
}

/** Merge runs inside the target checkout, so only a branch-bearing worktree of the child's repo can host it. */
function canHostMerge(child: Worktree, candidate: Worktree): boolean {
  return (
    candidate.id !== child.id &&
    candidate.repoId === child.repoId &&
    !candidate.isArchived &&
    Boolean(candidate.branch)
  )
}

function getTaskSource(
  worktree: Worktree,
  lineageById: Record<string, WorktreeLineage>
): MergeTargetTaskSource | null {
  const taskId = lineageById[worktree.id]?.taskId
  if (taskId) {
    return { kind: 'orchestration-task', taskId }
  }
  if (worktree.linkedIssue != null) {
    return { kind: 'issue', number: worktree.linkedIssue }
  }
  const context = worktree.linkedTaskSourceContext
  if (context) {
    return { kind: 'task-source', provider: context.provider, projectId: context.projectId }
  }
  return null
}

/** Refs arrive both qualified (`refs/remotes/origin/main`) and bare (`origin/main`, `main`). */
function branchFamily(ref: string): string {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  if (ref.startsWith('refs/remotes/')) {
    const withoutRemote = ref.slice('refs/remotes/'.length)
    const separator = withoutRemote.indexOf('/')
    return separator > 0 ? withoutRemote.slice(separator + 1) : withoutRemote
  }
  return ref
}

/** Exact family match wins; the remote-prefix fallback only runs when nothing matches exactly. */
function sourceBranchRank(child: Worktree, candidate: Worktree): 0 | 1 | null {
  const baseRef = child.baseRef
  if (!baseRef) {
    return null
  }
  const target = branchFamily(candidate.branch)
  if (!target) {
    return null
  }
  if (branchFamily(baseRef) === target) {
    return 0
  }
  if (!baseRef.startsWith('refs/')) {
    const separator = baseRef.indexOf('/')
    if (separator > 0 && baseRef.slice(separator + 1) === target) {
      return 1
    }
  }
  return null
}

export function getMergeTargetCandidates(args: {
  child: Worktree
  parentWorktree: Worktree | null
  worktrees: readonly Worktree[]
  lineageById: Record<string, WorktreeLineage>
}): MergeTargetCandidate[] {
  const sourceRanks = new Map<string, 0 | 1>()
  for (const worktree of args.worktrees) {
    if (!canHostMerge(args.child, worktree)) {
      continue
    }
    const rank = sourceBranchRank(args.child, worktree)
    if (rank !== null) {
      sourceRanks.set(worktree.id, rank)
    }
  }
  const hasExactSource = [...sourceRanks.values()].includes(0)
  const isSource = (id: string): boolean => {
    const rank = sourceRanks.get(id)
    return rank !== undefined && (!hasExactSource || rank === 0)
  }

  const items: MergeTargetCandidate[] = []
  const parent = args.parentWorktree
  if (parent && canHostMerge(args.child, parent)) {
    items.push({
      worktree: parent,
      isParent: true,
      isSourceBranch: isSource(parent.id),
      taskSource: getTaskSource(parent, args.lineageById)
    })
  }
  for (const worktree of args.worktrees) {
    if (worktree.id === parent?.id || !canHostMerge(args.child, worktree)) {
      continue
    }
    items.push({
      worktree,
      isParent: false,
      isSourceBranch: isSource(worktree.id),
      taskSource: getTaskSource(worktree, args.lineageById)
    })
  }

  const order = (candidate: MergeTargetCandidate): number => {
    if (candidate.isParent) {
      return 0
    }
    if (candidate.isSourceBranch) {
      return 1
    }
    if (candidate.taskSource) {
      return 2
    }
    return 3
  }
  return items.sort(
    (a, b) => order(a) - order(b) || a.worktree.displayName.localeCompare(b.worktree.displayName)
  )
}
