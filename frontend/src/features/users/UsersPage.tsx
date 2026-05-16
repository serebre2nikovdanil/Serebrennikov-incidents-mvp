import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Space,
  Popconfirm,
  message,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import { CatalogItem, User } from '@/api/types';
import { useAuth } from '@/shared/auth';

const ROLES = [
  { value: 'manager', label: 'Менеджер' },
  { value: 'supervisor', label: 'Руководитель' },
  { value: 'administrator', label: 'Администратор' },
];

const ROLE_COLOR: Record<string, string> = {
  manager: 'blue',
  supervisor: 'purple',
  administrator: 'red',
};

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [items, setItems] = useState<User[]>([]);
  const [departments, setDepartments] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const load = () => api.get<User[]>('/users').then((r) => setItems(r.data));

  useEffect(() => {
    load();
    api.get<CatalogItem[]>('/catalogs/departments').then((r) => setDepartments(r.data));
  }, []);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department?.name ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (creating) {
        await api.post('/users', values);
        setCreating(false);
      } else if (editing) {
        // Не отправляем пустой пароль
        if (!values.password) delete values.password;
        await api.patch(`/users/${editing.id}`, values);
        setEditing(null);
      }
      message.success('Сохранено');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? 'Ошибка');
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      message.success('Пользователь удалён');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? 'Не удалось удалить');
    }
  };

  return (
    <Card>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            setCreating(true);
          }}
        >
          Добавить пользователя
        </Button>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Поиск по имени, email, отделу"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 320 }}
        />
      </Space>
      <Table<User>
        rowKey="id"
        dataSource={filteredItems}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: 'Имя', dataIndex: 'full_name' },
          { title: 'Email', dataIndex: 'email' },
          {
            title: 'Роль',
            dataIndex: 'role',
            render: (v: string) => (
              <Tag color={ROLE_COLOR[v]}>
                {ROLES.find((r) => r.value === v)?.label}
              </Tag>
            ),
          },
          { title: 'Отдел', render: (_, r) => r.department?.name ?? '—' },
          {
            title: 'Статус',
            dataIndex: 'is_blocked',
            render: (v: boolean) => (
              <Tag color={v ? 'red' : 'green'}>{v ? 'Заблокирован' : 'Активен'}</Tag>
            ),
          },
          {
            title: '',
            width: 200,
            render: (_, r) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    form.setFieldsValue({
                      full_name: r.full_name,
                      email: r.email,
                      role: r.role,
                      department_id: r.department?.id,
                      is_blocked: r.is_blocked,
                    });
                    setEditing(r);
                  }}
                >
                  Изменить
                </Button>
                {r.id !== currentUser?.id && (
                  <Popconfirm
                    title="Удалить пользователя?"
                    description="Если есть инциденты или комментарии — удаление не пройдёт."
                    okText="Да"
                    cancelText="Нет"
                    onConfirm={() => remove(r.id)}
                  >
                    <Button size="small" danger>
                      Удалить
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={creating || !!editing}
        title={creating ? 'Новый пользователь' : `Изменить пользователя #${editing?.id}`}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onOk={submit}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="full_name" label="Имя" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={creating ? 'Пароль' : 'Новый пароль (оставьте пустым чтобы не менять)'}
            rules={creating ? [{ required: true, min: 8 }] : [{ min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
            <Select options={ROLES} />
          </Form.Item>
          <Form.Item name="department_id" label="Отдел">
            <Select
              allowClear
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          {!creating && (
            <Form.Item name="is_blocked" label="Заблокирован" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
