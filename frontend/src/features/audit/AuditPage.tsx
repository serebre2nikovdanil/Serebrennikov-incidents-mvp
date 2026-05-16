import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, DatePicker, Select, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/api/client';
import { AuditEntry, AuditList } from '@/api/types';

const ACTION_COLORS: Record<string, string> = {
  create: 'green',
  update: 'blue',
  transition: 'purple',
  delete: 'red',
};

export function AuditPage() {
  const [data, setData] = useState<AuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{
    action_type?: string;
    object_type?: string;
    period?: [Dayjs, Dayjs] | null;
  }>({});

  const load = () => {
    setLoading(true);
    const params: any = { limit: 200 };
    if (filters.action_type) params.action_type = filters.action_type;
    if (filters.object_type) params.object_type = filters.object_type;
    if (filters.period) {
      params.period_from = filters.period[0].toISOString();
      params.period_to = filters.period[1].toISOString();
    }
    api
      .get<AuditList>('/audit/entries', { params })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filters]);

  return (
    <Card>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Журнал аудита
      </Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Тип события"
          allowClear
          style={{ width: 180 }}
          onChange={(v) => setFilters((f) => ({ ...f, action_type: v }))}
          options={[
            { value: 'create', label: 'Создание' },
            { value: 'update', label: 'Изменение' },
            { value: 'transition', label: 'Переход статуса' },
          ]}
        />
        <Select
          placeholder="Тип объекта"
          allowClear
          style={{ width: 200 }}
          onChange={(v) => setFilters((f) => ({ ...f, object_type: v }))}
          options={[
            { value: 'incident', label: 'Инцидент' },
            { value: 'user', label: 'Пользователь' },
            { value: 'comment', label: 'Комментарий' },
            { value: 'attachment', label: 'Вложение' },
          ]}
        />
        <DatePicker.RangePicker
          showTime
          onChange={(v) => setFilters((f) => ({ ...f, period: v as any }))}
        />
      </Space>
      <Table<AuditEntry>
        rowKey="id"
        loading={loading}
        dataSource={data?.items ?? []}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          {
            title: 'Действие',
            dataIndex: 'action_type',
            width: 140,
            render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v}</Tag>,
          },
          { title: 'Объект', dataIndex: 'object_type', width: 140 },
          { title: 'ID объекта', dataIndex: 'object_id', width: 100 },
          {
            title: 'Пользователь',
            render: (_, r) => r.initiator?.full_name ?? '—',
            width: 200,
          },
          {
            title: 'Было',
            dataIndex: 'previous_value',
            ellipsis: true,
            render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>,
          },
          {
            title: 'Стало',
            dataIndex: 'new_value',
            ellipsis: true,
            render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>,
          },
          {
            title: 'Время',
            dataIndex: 'created_at',
            width: 170,
            render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm:ss'),
          },
        ]}
      />
    </Card>
  );
}
