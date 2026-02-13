// ============================================================
// StatusBadge.tsx - Project status indicator (draft/ready/error)
// ============================================================

import { h, FunctionalComponent } from 'preact';
import type { ProjectStatus } from '../../plugin/types/runner.types';

interface Props {
  status: ProjectStatus;
}

const STATUS_MAP: Record<ProjectStatus, { label: string; cssVar: string }> = {
  draft: { label: 'Draft', cssVar: 'var(--color-status-draft)' },
  ready: { label: 'Ready', cssVar: 'var(--color-status-ready)' },
  error: { label: 'Error', cssVar: 'var(--color-status-error)' },
};

export const StatusBadge: FunctionalComponent<Props> = ({ status }) => {
  const { label, cssVar } = STATUS_MAP[status] || STATUS_MAP.draft;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: 'var(--font-size-xs)',
        color: cssVar,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: cssVar,
        }}
      />
      {label}
    </span>
  );
};
