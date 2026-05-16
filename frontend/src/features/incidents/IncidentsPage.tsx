import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Tag,
  Space,
  Card,
  Typography,
  Input,
  Select,
  DatePicker,
  Button,
  Row,
  Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, ClearOutlined } from '@ant-design/icons';
import { useNavigate, useOutletContext } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/api/client';
import {
  CatalogItem,
  IncidentList,
  IncidentListItem,
  IncidentStatus,
} from '@/api/types';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  severityColor,
} from '@/shared/statusUtils';
import { useAuth } from '@/shared/auth';
import { IncidentFormModal } from '@/shared/IncidentFormModal';

interface OutletCtx {
  refreshKey: number;
  refresh: () => void;
}

interface Filters {
  keyword?: string;
  status?: IncidentStatus;
  severity_id?: number;
  category_id?: number;
  source_id?: number;
  funnel_stage_id?: number;
  department_id?: number;
  period?: [Dayjs, Dayjs];
}

const STATUS_OPTIONS: { value: IncidentStatus; label: string }[] = [
  { value: 'registered', label: 'Зарегистрирован' },
  { value: 'under_review', label: 'На разборе' },
  { value: 'processed', label: 'Обработан' },
  { value: 'closed', label: 'Закрыт' },
  { value: 'cancelled', label: 'Отменён' },
];

export function IncidentsPage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<OutletCtx>();
  const { user } = useAuth();
  const [data, setData] = useState<IncidentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});
  const [showForm, setShowForm] = useState(false);

  const [departments, setDepartments] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [severities, setSeverities] = useState<CatalogItem[]>([]);
  const [sources, setSources] = useState<CatalogItem[]>([]);
  const [stages, setStages] = useState<CatalogItem[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<CatalogItem[]>('/catalogs/departments', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/categories', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/severities', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/sources', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/funnel_stages', { params: { only_active: true } }),
    ]).then(([d, c, s, src, f]) => {
      setDepartments(d.data);
      setCategories(c.data);
      setSeverities(s.data);
      setSources(src.data);
      setStages(f.data);
    });
  }, []);

  const load = async () => {
    setLoading(true);
    const params: Record<string, unknown> = { limit: 200 };
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.status) params.status = filters.status;
    if (filters.severity_id) params.severity_id = filters.severity_id;
    if (filters.category_id) params.category_id = filters.category_id;
    if (filters.source_id) params.source_id = filters.source_id;
    if (filters.funnel_stage_id) params.funnel_stage_id = filters.funnel_stage_id;
    if (filters.department_id) params.department_id = filters.department_id;
    if (filters.period) {
      params.period_from = filters.period[0].toISOString();
      params.period_to = filters.period[1].toISOString();
    }
    const res = await api.get<IncidentList>('/incidents', { params });
    setData(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [ctx.refreshKey, filters]);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v !== undefined && v !== ''),
    [filters],
  );

  const canRegister = user?.role === 'manager' || user?.role === 'administrator';

  return (
    <>
      <Card>
        <Space
          style={{
            marginBottom: 16,
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <Typography.Title level={3} style={{ margin: 0 }}>
            Инциденты
          </Typography.Title>
          {canRegister && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setShowForm(true)}
            >
              Зарегистрировать инцидент
            </Button>
          )}
        </Space>

        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <Row gutter={[8, 8]}>
            <Col xs={24} md={8}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Поиск по описанию"
                value={filters.keyword ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, keyword: e.target.value || undefined }))
                }
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                allowClear
                placeholder="Статус"
                style={{ width: '100%' }}
                value={filters.status}
                onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                options={STATUS_OPTIONS}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                allowClear
                placeholder="Тяжесть"
                style={{ width: '100%' }}
                value={filters.severity_id}
                onChange={(v) => setFilters((f) => ({ ...f, severity_id: v }))}
                options={severities.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Категория"
                style={{ width: '100%' }}
                value={filters.category_id}
                onChange={(v) => setFilters((f) => ({ ...f, category_id: v }))}
                options={categories.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                allowClear
                placeholder="Источник"
                style={{ width: '100%' }}
                value={filters.source_id}
                onChange={(v) => setFilters((f) => ({ ...f, source_id: v }))}
                options={sources.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Col>
            <Col xs={12} md={6}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Этап воронки"
                style={{ width: '100%' }}
                value={filters.funnel_stage_id}
                onChange={(v) => setFilters((f) => ({ ...f, funnel_stage_id: v }))}
                options={stages.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Col>
            <Col xs={12} md={6}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Отдел"
                style={{ width: '100%' }}
                value={filters.department_id}
                onChange={(v) => setFilters((f) => ({ ...f, department_id: v }))}
                options={departments.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Col>
            <Col xs={24} md={8}>
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                placeholder={['Начало периода', 'Конец периода']}
                value={filters.period}
                onChange={(v) =>
                  setFilters((f) => ({ ...f, period: v as Filters['period'] }))
                }
              />
            </Col>
            <Col xs={24} md={4}>
              <Button
                icon={<ClearOutlined />}
                onClick={() => setFilters({})}
                disabled={!hasActiveFilters}
                block
              >
                Сбросить
              </Button>
            </Col>
          </Row>
        </Card>

        <Table<IncidentListItem>
          rowKey="id"
          loading={loading}
          dataSource={data?.items ?? []}
          onRow={(record) => ({
            onClick: () => navigate(`/incidents/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            pageSize: 20,
            showTotal: (total) => `Всего: ${total}`,
          }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 70 },
            { title: 'Описание', dataIndex: 'description', ellipsis: true },
            {
              title: 'Статус',
              dataIndex: 'status',
              width: 150,
              render: (s: IncidentStatus) => (
                <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>
              ),
            },
            {
              title: 'Тяжесть',
              width: 140,
              render: (_, r) =>
                r.severity ? (
                  <Tag color={severityColor((r.severity as any).code)}>{r.severity.name}</Tag>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Категория',
              width: 200,
              render: (_, r) => r.category?.name ?? '—',
            },
            { title: 'Этап воронки', dataIndex: ['funnel_stage', 'name'], width: 180 },
            { title: 'Отдел', dataIndex: ['department', 'name'], width: 200 },
            {
              title: 'Инициатор',
              width: 180,
              render: (_, r) =>
                r.is_anonymous ? <Tag>Анонимно</Tag> : r.initiator?.full_name ?? '—',
            },
            {
              title: 'Зарегистрирован',
              dataIndex: 'registered_at',
              width: 170,
              render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm'),
            },
          ]}
        />
      </Card>

      <IncidentFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={load}
      />
    </>
  );
}
