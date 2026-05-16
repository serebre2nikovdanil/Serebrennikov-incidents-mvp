import { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Tag, Space, FloatButton } from 'antd';
import {
  UnorderedListOutlined,
  DashboardOutlined,
  BookOutlined,
  TeamOutlined,
  AuditOutlined,
  LogoutOutlined,
  UserOutlined,
  PlusOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth';
import { IncidentFormModal } from './IncidentFormModal';

const { Header, Sider, Content } = Layout;

const ROLE_LABELS: Record<string, string> = {
  manager: 'Менеджер',
  supervisor: 'Руководитель',
  administrator: 'Администратор',
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);

  if (!user) return null;

  const menuItems = [
    { key: '/incidents', icon: <UnorderedListOutlined />, label: 'Инциденты' },
    user.role !== 'manager' && {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Дашборд',
    },
    user.role === 'manager' && {
      key: '/my-templates',
      icon: <FileTextOutlined />,
      label: 'Мои шаблоны',
    },
    user.role === 'administrator' && {
      key: '/catalogs',
      icon: <BookOutlined />,
      label: 'Справочники',
    },
    user.role === 'administrator' && {
      key: '/users',
      icon: <TeamOutlined />,
      label: 'Пользователи',
    },
    user.role === 'administrator' && {
      key: '/audit',
      icon: <AuditOutlined />,
      label: 'Журнал аудита',
    },
  ].filter(Boolean) as { key: string; icon: any; label: string }[];

  const canRegister = user.role === 'manager' || user.role === 'administrator';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={64} theme="light">
        <div
          style={{
            color: '#1677ff',
            fontWeight: 700,
            padding: 16,
            fontSize: 16,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          Учет инцидентов
        </div>
        <Menu
          mode="inline"
          selectedKeys={['/' + (location.pathname.split('/')[1] || '')]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <div />
          <Space>
            <Tag color="blue">{ROLE_LABELS[user.role]}</Tag>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Выйти',
                    onClick: () => logout().then(() => navigate('/login')),
                  },
                ],
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                <span>{user.full_name}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet context={{ refreshKey, refresh: () => setRefreshKey((x) => x + 1) }} />
        </Content>
      </Layout>

      {canRegister && (
        <>
          <FloatButton
            icon={<PlusOutlined />}
            type="primary"
            tooltip="Зарегистрировать инцидент"
            onClick={() => setShowForm(true)}
          />
          <IncidentFormModal
            open={showForm}
            onClose={() => setShowForm(false)}
            onCreated={() => setRefreshKey((x) => x + 1)}
          />
        </>
      )}
    </Layout>
  );
}
