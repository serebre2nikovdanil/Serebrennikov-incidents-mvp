import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const user = await login(values.email, values.password);
      message.success(`Добро пожаловать, ${user.full_name}`);
      navigate(user.role === 'manager' ? '/incidents' : '/dashboard');
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #e0eaff 0%, #f5f7ff 100%)',
      }}
    >
      <Card style={{ width: 400 }}>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          ИС учёта инцидентов
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          Вход в систему
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={submit}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Войти
          </Button>
        </Form>
        <Alert
          style={{ marginTop: 16 }}
          message="Учётка по умолчанию: admin@example.com / admin12345"
          type="info"
          showIcon
        />
      </Card>
    </div>
  );
}
