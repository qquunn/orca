import { useMemo } from 'react'
import { GitBranch, GitMerge } from 'lucide-react'
import {
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { branchDisplayName } from './WorktreeCardHelpers'
import { useMenuScopedWorktreeCatalog } from './use-menu-scoped-worktree-catalog'
import { getMergeTargetCandidates, type MergeTargetCandidate } from './merge-target-candidates'
import type { Worktree } from '../../../../shared/worktree/types'

function getMergeTargetSourceLabel(candidate: MergeTargetCandidate): string {
  if (candidate.isParent) {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.mergeTargetParent',
      'Parent workspace'
    )
  }
  const source = candidate.taskSource
  if (candidate.isSourceBranch) {
    const sourceBranch = translate(
      'auto.components.sidebar.WorktreeContextMenu.mergeTargetSourceBranch',
      'Source branch'
    )
    return source ? `${sourceBranch} · ${taskSourceLabel(source)}` : sourceBranch
  }
  if (!source) {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.mergeTargetOther',
      'Other workspace'
    )
  }
  return taskSourceLabel(source)
}

function taskSourceLabel(source: NonNullable<MergeTargetCandidate['taskSource']>): string {
  if (source.kind === 'orchestration-task') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.mergeTargetTask',
      'Task {{taskId}}',
      { taskId: source.taskId }
    )
  }
  if (source.kind === 'issue') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.mergeTargetIssue',
      'Issue #{{number}}',
      { number: source.number }
    )
  }
  return translate(
    'auto.components.sidebar.WorktreeContextMenu.mergeTargetTaskSource',
    '{{provider}} task',
    { provider: source.provider }
  )
}

function MergeTargetMenuItem({
  candidate,
  disabled,
  onSelect
}: {
  candidate: MergeTargetCandidate
  disabled: boolean
  onSelect: (worktree: Worktree) => void
}) {
  return (
    <DropdownMenuItem
      className="items-start py-1.5"
      disabled={disabled}
      onSelect={() => onSelect(candidate.worktree)}
    >
      <GitMerge className="mt-0.5 size-3.5" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="max-w-56 truncate text-[13px] font-medium">
          {candidate.worktree.displayName}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[11px] leading-none text-muted-foreground">
          <GitBranch className="size-3 shrink-0" />
          <span className="max-w-28 truncate">{branchDisplayName(candidate.worktree.branch)}</span>
          <span className="shrink-0">· {getMergeTargetSourceLabel(candidate)}</span>
        </span>
      </div>
    </DropdownMenuItem>
  )
}

export function WorktreeMergeTargetSubMenu({
  child,
  parentWorktreeId,
  disabled,
  onSelect
}: {
  child: Worktree
  parentWorktreeId: string | null
  disabled: boolean
  onSelect: (worktree: Worktree) => void
}) {
  const { worktreeMap, allWorktrees } = useMenuScopedWorktreeCatalog(true)
  const lineageById = useAppStore((s) => s.worktreeLineageById)
  const candidates = useMemo(() => {
    const parentWorktree = parentWorktreeId ? worktreeMap.get(parentWorktreeId) : null
    return getMergeTargetCandidates({
      child,
      parentWorktree: parentWorktree ?? null,
      worktrees: allWorktrees,
      lineageById
    })
  }, [allWorktrees, child, lineageById, parentWorktreeId, worktreeMap])
  if (candidates.length === 0) {
    return null
  }
  const parentCandidate = candidates.find((candidate) => candidate.isParent)
  const sourceCandidate = candidates.find((candidate) => candidate.isSourceBranch) ?? null
  const taskCandidates = candidates.filter((candidate) => !candidate.isParent)
  return (
    <>
      {sourceCandidate ? (
        <DropdownMenuItem disabled={disabled} onSelect={() => onSelect(sourceCandidate.worktree)}>
          <GitMerge className="size-3.5" />
          {translate(
            'auto.components.sidebar.WorktreeContextMenu.mergeIntoSourceBranch',
            'Merge into {{branch}}',
            { branch: branchDisplayName(sourceCandidate.worktree.branch) }
          )}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>
          <GitMerge className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeContextMenu.mergeInto', 'Merge into…')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="scrollbar-sleek max-h-80 min-w-64 overflow-y-auto">
          {parentCandidate ? (
            <MergeTargetMenuItem
              candidate={parentCandidate}
              disabled={disabled}
              onSelect={onSelect}
            />
          ) : null}
          {parentCandidate && taskCandidates.length > 0 ? <DropdownMenuSeparator /> : null}
          {taskCandidates.map((candidate) => (
            <MergeTargetMenuItem
              key={candidate.worktree.id}
              candidate={candidate}
              disabled={disabled}
              onSelect={onSelect}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  )
}
