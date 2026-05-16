import { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  Tag,
  Checkbox,
} from 'antd';
import dayjs from 'dayjs';
import { api } from '@/api/client';
import { CatalogItem, IncidentTemplate } from '@/api/types';
import { useAuth } from './auth';
import { severityColor } from './statusUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface CatalogsBundle {
  departments: CatalogItem[];
  categories: CatalogItem[];
  severities: CatalogItem[];
  sources: CatalogItem[];
  funnel_stages: CatalogItem[];
  consequences: CatalogItem[];
  templates: IncidentTemplate[];
}

const { TextArea } = Input;

export function IncidentFormModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<CatalogsBundle | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get<CatalogItem[]>('/catalogs/departments', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/categories', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/severities', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/sources', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/funnel_stages', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/consequences', { params: { only_active: true } }),
      api.get<IncidentTemplate[]>('/incident-templates', { params: { only_active: true } }),
    ]).then(([d, c, s, src, f, cq, t]) => {
      const b: CatalogsBundle = {
        departments: d.data,
        categories: c.data,
        severities: s.data,
        sources: src.data,
        funnel_stages: f.data,
        consequences: cq.data,
        templates: t.data,
      };
      setBundle(b);
      // Автозаполнение: только подразделение (из юзера) и текущая дата
      form.setFieldsValue({
        department_id: user?.department?.id ?? b.departments[0]?.id,
        occured_at: dayjs(),
      });
    });
  }, [open, form, user]);

  const applyTemplate = (template: IncidentTemplate) => {
    form.setFieldsValue({
      category_id: template.category_id,
      severity_id: template.severity_id,
      source_id: template.source_id,
      funnel_stage_id: template.funnel_stage_id,
      description: template.description_template ?? '',
    });
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.post('/incidents', {
        ...values,
        occured_at: values.occured_at.toISOString(),
        consequence_ids: values.consequence_ids ?? [],
        is_anonymous: values.is_anonymous ?? false,
      });
      message.success('Инцидент зарегистрирован');
      form.resetFields();
      onCreated();
      onClose();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.detail ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Зарегистрировать инцидент"
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={submit}
      confirmLoading={saving}
      width={720}
      okText="Сохранить (Ctrl+Enter)"
      cancelText="Отмена"
    >
      {bundle && (
        <>
          {bundle.templates.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
                Шаблоны быстрого старта:
              </div>
              <Space wrap>
                {bundle.templates.map((t) => (
                  <Button key={t.id} size="small" onClick={() => applyTemplate(t)}>
                    {t.name}
                  </Button>
                ))}
              </Space>
            </div>
          )}
          <Form
            form={form}
            layout="vertical"
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === 'Enter') submit();
            }}
          >
            <Form.Item
              name="description"
              label="Описание инцидента"
              rules={[{ required: true, max: 2000 }]}
            >
              <TextArea
                rows={4}
                autoFocus
                placeholder="Что произошло? Опишите ситуацию (до 2000 символов)"
                maxLength={2000}
                showCount
              />
            </Form.Item>
            <Form.Item name="severity_id" label="Тяжесть">
              <Select
                allowClear
                placeholder="Не выбрано"
                options={bundle.severities.map((s) => ({
                  value: s.id,
                  label: (
                    <Tag color={severityColor(s.code)} style={{ marginRight: 0 }}>
                      {s.name}
                    </Tag>
                  ),
                }))}
              />
            </Form.Item>
            <Form.Item name="category_id" label="Категория">
              <Select
                allowClear
                showSearch
                placeholder="Не выбрано"
                optionFilterProp="label"
                options={bundle.categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
            <Form.Item name="source_id" label="Источник">
              <Select
                allowClear
                placeholder="Не выбрано"
                options={bundle.sources.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item
              name="funnel_stage_id"
              label="Этап воронки продаж"
              rules={[{ required: true, message: 'Выберите этап воронки' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Выберите этап"
                options={bundle.funnel_stages.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item
              name="department_id"
              label="Подразделение"
              rules={[{ required: true, message: 'Выберите подразделение' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Выберите подразделение"
                options={bundle.departments.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item
              name="occured_at"
              label="Дата и время инцидента"
              rules={[{ required: true }]}
            >
              <DatePicker showTime style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" />
            </Form.Item>
            <Form.Item name="consequence_ids" label="Виды последствий">
              <Select
                mode="multiple"
                placeholder="Выберите один или несколько видов последствий"
                options={bundle.consequences.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item name="is_anonymous" valuePropName="checked">
              <Checkbox>Зарегистрировать анонимно</Checkbox>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
