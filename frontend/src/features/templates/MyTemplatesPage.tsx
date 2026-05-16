import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  Select,
  Tag,
  Space,
  Typography,
  Popconfirm,
  message,
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import { CatalogItem, IncidentTemplate } from '@/api/types';

export function MyTemplatesPage() {
  const [items, setItems] = useState<IncidentTemplate[]>([]);
  const [cats, setCats] = useState<CatalogItem[]>([]);
  const [sevs, setSevs] = useState<CatalogItem[]>([]);
  const [srcs, setSrcs] = useState<CatalogItem[]>([]);
  const [stages, setStages] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState<IncidentTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<IncidentTemplate[]>('/incident-templates', { params: { only_mine: true } })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get<CatalogItem[]>('/catalogs/categories', { params: { only_active: true } }).then((r) => setCats(r.data));
    api.get<CatalogItem[]>('/catalogs/severities', { params: { only_active: true } }).then((r) => setSevs(r.data));
    api.get<CatalogItem[]>('/catalogs/sources', { params: { only_active: true } }).then((r) => setSrcs(r.data));
    api.get<CatalogItem[]>('/catalogs/funnel_stages', { params: { only_active: true } }).then((r) => setStages(r.data));
  }, []);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description_template ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const nameOf = (list: CatalogItem[], id: number | null) =>
    id ? list.find((x) => x.id === id)?.name ?? '—' : '—';

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setCreating(true);
  };

  const openEdit = (t: IncidentTemplate) => {
    form.setFieldsValue(t);
    setEditing(t);
  };

  const submit = async () => {
    try {
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
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.detail ?? 'Ошибка');
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/incident-templates/${id}`);
      message.success('Удалено');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? 'Ошибка');
    }
  };

  return (
    <Card>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Мои шаблоны
        </Typography.Title>
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Поиск"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Создать шаблон
          </Button>
        </Space>
      </Space>

      <Typography.Paragraph type="secondary">
        Шаблоны помогают быстро регистрировать типовые инциденты. Кнопки шаблонов появятся в шапке
        формы регистрации — клик заполнит поля автоматически.
      </Typography.Paragraph>

      <Table<IncidentTemplate>
        rowKey="id"
        loading={loading}
        dataSource={filteredItems}
        pagination={false}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: 'Название', dataIndex: 'name' },
          { title: 'Категория', render: (_, r) => nameOf(cats, r.category_id) },
          { title: 'Тяжесть', render: (_, r) => nameOf(sevs, r.severity_id) },
          { title: 'Источник', render: (_, r) => nameOf(srcs, r.source_id) },
          { title: 'Этап воронки', render: (_, r) => nameOf(stages, r.funnel_stage_id) },
          {
            title: 'Активен',
            dataIndex: 'is_active',
            width: 100,
            render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Да' : 'Нет'}</Tag>,
          },
          {
            title: '',
            width: 180,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => openEdit(r)}>
                  Изменить
                </Button>
                <Popconfirm
                  title="Удалить шаблон?"
                  okText="Да"
                  cancelText="Нет"
                  onConfirm={() => remove(r.id)}
                >
                  <Button size="small" danger>
                    Удалить
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
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
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Например: «Ошибка в моём КП»" />
          </Form.Item>
          <Form.Item name="description_template" label="Шаблон описания">
            <Input.TextArea rows={3} placeholder="Текст подставится в поле описания инцидента" />
          </Form.Item>
          <Form.Item name="category_id" label="Категория">
            <Select
              allowClear
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
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
