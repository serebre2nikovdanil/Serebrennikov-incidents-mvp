import { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { api } from '@/api/client';
import { CatalogItem, Incident } from '@/api/types';
import { severityColor } from '@/shared/statusUtils';

interface Props {
  open: boolean;
  incident: Incident | null;
  onClose: () => void;
  onSaved: () => void;
}

interface CatalogsBundle {
  categories: CatalogItem[];
  severities: CatalogItem[];
  sources: CatalogItem[];
  funnel_stages: CatalogItem[];
  consequences: CatalogItem[];
}

const { TextArea } = Input;

export function IncidentEditModal({ open, incident, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const [bundle, setBundle] = useState<CatalogsBundle | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !incident) return;
    Promise.all([
      api.get<CatalogItem[]>('/catalogs/categories', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/severities', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/sources', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/funnel_stages', { params: { only_active: true } }),
      api.get<CatalogItem[]>('/catalogs/consequences', { params: { only_active: true } }),
    ]).then(([c, s, src, f, cq]) => {
      setBundle({
        categories: c.data,
        severities: s.data,
        sources: src.data,
        funnel_stages: f.data,
        consequences: cq.data,
      });
      form.setFieldsValue({
        description: incident.description,
        occured_at: dayjs(incident.occured_at),
        category_id: incident.category?.id,
        severity_id: incident.severity?.id,
        source_id: incident.source?.id,
        funnel_stage_id: incident.funnel_stage.id,
        consequence_ids: incident.consequences.map((c) => c.id),
      });
    });
  }, [open, incident, form]);

  const submit = async () => {
    if (!incident) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.patch(`/incidents/${incident.id}`, {
        ...values,
        occured_at: values.occured_at.toISOString(),
      });
      message.success('Изменения сохранены');
      onSaved();
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
      title={incident ? `Изменить инцидент #${incident.id}` : ''}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      width={720}
      okText="Сохранить"
      cancelText="Отмена"
      destroyOnClose
    >
      {bundle && (
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
            <TextArea rows={4} maxLength={2000} showCount />
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
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={bundle.funnel_stages.map((s) => ({ value: s.id, label: s.name }))}
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
              options={bundle.consequences.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
