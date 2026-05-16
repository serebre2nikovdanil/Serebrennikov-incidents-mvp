export type UserRole = 'manager' | 'supervisor' | 'administrator';

export type IncidentStatus = 'registered' | 'under_review' | 'processed' | 'closed' | 'cancelled';

export interface Ref {
  id: number;
  name: string;
}

export interface UserRef {
  id: number;
  full_name: string;
}

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_blocked: boolean;
  department: Ref | null;
  created_at: string;
}

export interface CatalogItem {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  code?: string;
  order_number?: number;
}

export interface IncidentTemplate {
  id: number;
  name: string;
  description_template: string | null;
  category_id: number | null;
  severity_id: number | null;
  source_id: number | null;
  funnel_stage_id: number | null;
  owner_id: number | null;
  is_active: boolean;
}

export interface StatusHistoryItem {
  id: number;
  previous_status: IncidentStatus | null;
  new_status: IncidentStatus;
  transition_reason: string | null;
  initiator: UserRef;
  changed_at: string;
}

export interface Comment {
  id: number;
  text: string;
  author: UserRef;
  created_at: string;
}

export interface Attachment {
  id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploader: UserRef;
  uploaded_at: string;
}

export interface IncidentListItem {
  id: number;
  description: string;
  status: IncidentStatus;
  registered_at: string;
  occured_at: string;
  is_anonymous: boolean;
  initiator: UserRef | null;
  department: Ref;
  category: Ref | null;
  severity: Ref | null;
  source: Ref | null;
  funnel_stage: Ref;
}

export interface Incident extends IncidentListItem {
  cancellation_reason: string | null;
  reopening_reason: string | null;
  consequences: Ref[];
  status_history: StatusHistoryItem[];
  comments: Comment[];
  attachments: Attachment[];
}

export interface IncidentList {
  items: IncidentListItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface RecentValues {
  category_ids: number[];
  source_ids: number[];
  funnel_stage_ids: number[];
}

export interface DashboardKpi {
  total_incidents: number;
  mttr_hours: number;
  closure_coefficient: number;
  recurrence_frequency: number;
  critical_share: number;
}

export interface DashboardData {
  kpis: { current: DashboardKpi; previous: DashboardKpi };
  funnel: { id: number; name: string; count: number }[];
  trend: {
    date: string | null;
    registered: number;
    closed: number;
    critical: number;
  }[];
  top_departments: { id: number; name: string; count: number }[];
  distributions: {
    categories: { id: number; name: string; count: number }[];
    sources: { id: number; name: string; count: number }[];
    severities: { id: number; name: string; count: number }[];
    statuses: { status: IncidentStatus; count: number }[];
    consequences: { id: number; name: string; count: number }[];
  };
  category_by_department: {
    category_id: number;
    category: string;
    department_id: number;
    department: string;
    count: number;
  }[];
  severity_by_stage_heatmap: {
    stage: string;
    severity: string;
    severity_code: string;
    count: number;
  }[];
  activity_heatmap: { day: number; hour: number; count: number }[];
}

export interface AuditEntry {
  id: number;
  action_type: string;
  object_type: string;
  object_id: string | null;
  previous_value: string | null;
  new_value: string | null;
  initiator: UserRef | null;
  created_at: string;
}

export interface AuditList {
  items: AuditEntry[];
  total: number;
  offset: number;
  limit: number;
}
