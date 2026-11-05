import type { TaskProvider } from '../../../../shared/task-source-context'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../shared/worktree/types'

export type MergeTargetTaskSource =
  | { kind: 'orchestration-task'; taskId: string }
  | { kind: 'issue'; number: number }
  | { kind: 'task-source'; provider: TaskProvider; projectId: string }

export type MergeTargetCandidate = {
  worktree: Worktree
  isParent: boolean
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

export function getMergeTargetCandidates(args: {
  child: Worktree
  parentWorktree: Worktree | null
  worktrees: readonly Worktree[]
  lineageById: Record<string, WorktreeLineage>
}): MergeTargetCandidate[] {
  const candidates = new Map<string, MergeTargetCandidate>()
  const parent = args.parentWorktree
  if (parent && canHostMerge(args.child, parent)) {
    candidates.set(parent.id, {
      worktree: parent,
      isParent: true,
      taskSource: getTaskSource(parent, args.lineageById)
    })
  }
  for (const worktree of args.worktrees) {
    if (candidates.has(worktree.id) || !canHostMerge(args.child, worktree)) {
      continue
    }
    const taskSource = getTaskSource(worktree, args.lineageById)
    if (!taskSource) {
      continue
    }
    candidates.set(worktree.id, { worktree, isParent: false, taskSource })
  }
  const items = [...candidates.values()]
  const parentCandidate = items.find((candidate) => candidate.isParent)
  const taskTargets = items
    .filter((candidate) => !candidate.isParent)
    .sort((a, b) => a.worktree.displayName.localeCompare(b.worktree.displayName))
  return parentCandidate ? [parentCandidate, ...taskTargets] : taskTargets
}
