import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  message,
  Tag,
  Space,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import { CatalogItem, IncidentTemplate } from '@/api/types';
import { DeleteCatalogModal } from './DeleteCatalogModal';

const CATALOG_LABEL: Record<string, string> = {
  departments: 'Подразделение',
  categories: 'Категория',
  severities: 'Тяжесть',
  sources: 'Источник',
  funnel_stages: 'Этап воронки',
  consequences: 'Последствие',
};

const CATALOGS = [
  { key: 'departments', label: 'Отделы' },
  { key: 'categories', label: 'Категории' },
  { key: 'severities', label: 'Тяжесть', hasCode: true, hasOrder: true },
  { key: 'sources', label: 'Источники', hasCode: true },
  { key: 'funnel_stages', label: 'Этапы воронки', hasOrder: true },
  { key: 'consequences', label: 'Последствия', hasCode: true },
];

interface CatalogTabProps {
  name: string;
  hasCode?: boolean;
  hasOrder?: boolean;
}

function CatalogTab({ name, hasCode, hasOrder }: CatalogTabProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const load = () =>
    api.get<CatalogItem[]>(`/catalogs/${name}`).then((r) => setItems(r.data));

  useEffect(() => {
    load();
    setSearch('');
  }, [name]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q) ||
        (i.code ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ is_active: true, order_number: 0 });
    setCreating(true);
  };

  const openEdit = (item: CatalogItem) => {
    form.setFieldsValue(item);
    setEditing(item);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (creating) {
      await api.post(`/catalogs/${name}`, values);
      setCreating(false);
    } else if (editing) {
      await api.patch(`/catalogs/${name}/${editing.id}`, values);
      setEditing(null);
    }
    message.success('Сохранено');
    load();
  };

  const onDeleted = () => {
    message.success('Удалено');
    load();
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" onClick={openCreate}>
          Добавить
        </Button>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Поиск"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
      </Space>
      <Table
        rowKey="id"
        dataSource={filteredItems}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: 'Название', dataIndex: 'name' },
          ...(hasCode ? [{ title: 'Код', dataIndex: 'code', width: 140 }] : []),
          ...(hasOrder ? [{ title: 'Порядок', dataIndex: 'order_number', width: 100 }] : []),
          {
            title: 'Активен',
            dataIndex: 'is_active',
            width: 100,
            render: (v: boolean) => (
              <Tag color={v ? 'green' : 'default'}>{v ? 'Да' : 'Нет'}</Tag>
            ),
          },
          {
            title: '',
            width: 180,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => openEdit(r)}>
                  Изменить
                </Button>
                <Button size="small" danger onClick={() => setDeleting(r)}>
                  Удалить
                </Button>
              </Space>
            ),
          },
        ]}
        pagination={false}
      />

      {deleting && (
        <DeleteCatalogModal
          open={!!deleting}
          catalogName={name}
          catalogLabel={CATALOG_LABEL[name] ?? name}
          item={deleting}
          allItems={items}
          onClose={() => setDeleting(null)}
          onDone={onDeleted}
        />
      )}

      <Modal
        open={creating || !!editing}
        title={creating ? 'Новый элемент' : `Изменить #${editing?.id}`}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onOk={submit}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          {hasCode && (
            <Form.Item name="code" label="Код" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          {hasOrder && (
            <Form.Item name="order_number" label="Порядок">
              <InputNumber min={0} />
            </Form.Item>
          )}
          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function TemplatesTab() {
  const [items, setItems] = useState<IncidentTemplate[]>([]);
  const [cats, setCats] = useState<CatalogItem[]>([]);
  const [sevs, setSevs] = useState<CatalogItem[]>([]);
  const [srcs, setSrcs] = useState<CatalogItem[]>([]);
  const [stages, setStages] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState<IncidentTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description_template ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const load = () => api.get<IncidentTemplate[]>('/incident-templates').then((r) => setItems(r.data));

  useEffect(() => {
    load();
    api.get<CatalogItem[]>('/catalogs/categories').then((r) => setCats(r.data));
    api.get<CatalogItem[]>('/catalogs/severities').then((r) => setSevs(r.data));
    api.get<CatalogItem[]>('/catalogs/sources').then((r) => setSrcs(r.data));
    api.get<CatalogItem[]>('/catalogs/funnel_stages').then((r) => setStages(r.data));
  }, []);

  const submit = async () => {
    const values = await form.validateFields();
    if (creating) {
      await api.post('/incident-templates', values);
      setCreating(false);
    } else if (editing) {
      await api.patch(`/incident-templates/${editing.id}`, values);
      setEditing(null);
    }
    message.success('Сохранено');
    load();
  };

  const nameOf = (list: CatalogItem[], id: number | null) =>
    id ? list.find((x) => x.id === id)?.name : '—';

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ is_active: true });
            setCreating(true);
          }}
        >
          Добавить шаблон
        </Button>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию/описанию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 320 }}
        />
      </Space>
      <Table
        rowKey="id"
        dataSource={filteredItems}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: 'Название', dataIndex: 'name' },
          { title: 'Категория', render: (_, r) => nameOf(cats, r.category_id) },
          { title: 'Тяжесть', render: (_, r) => nameOf(sevs, r.severity_id) },
          { title: 'Источник', render: (_, r) => nameOf(srcs, r.source_id) },
          { title: 'Этап', render: (_, r) => nameOf(stages, r.funnel_stage_id) },
          {
            title: 'Активен',
            dataIndex: 'is_active',
            render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Да' : 'Нет'}</Tag>,
          },
          {
            title: '',
            render: (_, r) => (
              <Button
                size="small"
                onClick={() => {
                  form.setFieldsValue(r);
                  setEditing(r);
                }}
              >
                Изменить
              </Button>
            ),
          },
        ]}
        pagination={false}
      />
      <Modal
        open={creating || !!editing}
        title={creating ? 'Новый шаблон' : `Изменить шаблон #${editing?.id}`}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onOk={submit}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input placeholder="Например: «Ошибка в КП»" />
          </Form.Item>
          <Form.Item name="description_template" label="Шаблон описания">
            <Input.TextArea
              rows={3}
              placeholder="Текст подставится в поле описания инцидента"
            />
          </Form.Item>
          <Form.Item name="category_id" label="Категория">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={cats.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="severity_id" label="Тяжесть">
            <Select
              allowClear
              options={sevs.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="source_id" label="Источник">
            <Select
              allowClear
              options={srcs.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="funnel_stage_id" label="Этап воронки">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function CatalogsPage() {
  return (
    <Card>
      <Tabs
        items={[
          ...CATALOGS.map((c) => ({
            key: c.key,
            label: c.label,
            children: (
              <CatalogTab name={c.key} hasCode={c.hasCode} hasOrder={c.hasOrder} />
            ),
          })),
          {
            key: 'templates',
            label: 'Шаблоны инцидентов',
            children: <TemplatesTab />,
          },
        ]}
      />
    </Card>
  );
}
