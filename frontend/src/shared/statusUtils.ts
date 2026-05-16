import { IncidentStatus } from '@/api/types';

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  registered: 'Зарегистрирован',
  under_review: 'На разборе',
  processed: 'Обработан',
  closed: 'Закрыт',
  cancelled: 'Отменён',
};

export const STATUS_COLOR: Record<IncidentStatus, string> = {
  registered: 'blue',
  under_review: 'orange',
  processed: 'purple',
  closed: 'green',
  cancelled: 'default',
};

export const STATUS_ORDER: IncidentStatus[] = [
  'registered',
  'under_review',
  'processed',
  'closed',
];

export const SEVERITY_COLOR: Record<string, string> = {
  critical: 'red',
  significant: 'orange',
  minor: 'blue',
};

export function severityColor(code?: string): string {
  return code ? SEVERITY_COLOR[code] ?? 'default' : 'default';
}

export interface TransitionOption {
  target: IncidentStatus;
  label: string;
  requiresReason: boolean;
}

export function availableTransitions(current: IncidentStatus): TransitionOption[] {
  const map: Record<IncidentStatus, TransitionOption[]> = {
    registered: [
      { target: 'under_review', label: 'Взять в разбор', requiresReason: false },
      { target: 'cancelled', label: 'Отменить', requiresReason: true },
    ],
    under_review: [
      { target: 'processed', label: 'Завершить разбор', requiresReason: false },
      { target: 'cancelled', label: 'Отменить', requiresReason: true },
    ],
    processed: [
      { target: 'closed', label: 'Закрыть инцидент', requiresReason: false },
      { target: 'under_review', label: 'Вернуть на доработку', requiresReason: true },
      { target: 'cancelled', label: 'Отменить', requiresReason: true },
    ],
    closed: [
      { target: 'under_review', label: 'Переоткрыть', requiresReason: true },
    ],
    cancelled: [],
  };
  return map[current] ?? [];
}
