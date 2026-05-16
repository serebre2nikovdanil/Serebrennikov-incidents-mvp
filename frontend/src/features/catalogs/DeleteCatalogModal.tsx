import { useEffect, useState } from 'react';
import { Modal, Select, Alert, Typography, Spin } from 'antd';
import { api } from '@/api/client';
import { CatalogItem } from '@/api/types';

interface UsageInfo {
  references: number;
  requires_replacement: boolean;
  is_m2m: boolean;
  supports_null: boolean;
}

interface Props {
  open: boolean;
  catalogName: string;        // departments, severities, ...
  catalogLabel: string;       // "Тяжесть", "Отделы", ...
  item: CatalogItem;          // элемент, который удаляем
  allItems: CatalogItem[];    // все элементы этого справочника (для выбора замены)
  onClose: () => void;
  onDone: () => void;         // callback после успешного удаления
}

const NULL_VALUE = -1; // в Select, отличаем «без замены»

export function DeleteCatalogModal({
  open,
  catalogName,
  catalogLabel,
  item,
  allItems,
  onClose,
  onDone,
}: Props) {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [replaceWith, setReplaceWith] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setReplaceWith(undefined);
    setError(null);
    api
      .get<UsageInfo>(`/catalogs/${catalogName}/${item.id}/usage`)
      .then((r) => setUsage(r.data))
      .finally(() => setLoading(false));
  }, [open, catalogName, item.id]);

  const otherItems = allItems.filter((x) => x.id !== item.id && x.is_active);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      if (replaceWith !== undefined && replaceWith !== NULL_VALUE) {
        params.replace_with = replaceWith;
      }
      await api.delete(`/catalogs/${catalogName}/${item.id}`, { params });
      onDone();
      onClose();
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (typeof detail === 'string') setError(detail);
      else if (detail?.message) setError(detail.message);
      else setError('Не удалось удалить');
    } finally {
      setSubmitting(false);
    }
  };

  const hasRefs = (usage?.references ?? 0) > 0;
  const requiresReplacement = usage?.requires_replacement;
  const supportsNull = usage?.supports_null;
  const isM2M = usage?.is_m2m;

  const okDisabled =
    loading ||
    submitting ||
    (requiresReplacement &&
      (replaceWith === undefined || replaceWith === NULL_VALUE));

  return (
    <Modal
      open={open}
      title={`Удалить «${item.name}»?`}
      onCancel={onClose}
      onOk={submit}
      okText="Удалить"
      okType="danger"
      cancelText="Отмена"
      confirmLoading={submitting}
      okButtonProps={{ disabled: okDisabled }}
      destroyOnClose
    >
      {loading ? (
        <Spin />
      ) : (
        <>
          {hasRefs ? (
            <Alert
              style={{ marginBottom: 16 }}
              type={requiresReplacement ? 'warning' : 'info'}
              showIcon
              message={
                <>
                  На «{item.name}» ссылается{' '}
                  <strong>{usage?.references} инцидент(ов)</strong>
                </>
              }
              description={
                requiresReplacement
                  ? 'Это обязательное поле в инцидентах. Выберите элемент, на который перенести ссылки.'
                  : isM2M
                  ? 'Можно либо удалить связи у инцидентов, либо заменить на другой вид последствий.'
                  : 'Можно перенести ссылки на другой элемент или очистить (оставить пустым).'
              }
            />
          ) : (
            <Typography.Paragraph>
              На этот элемент справочника никто не ссылается — удаление безопасно.
            </Typography.Paragraph>
          )}

          {hasRefs && (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>
                {catalogLabel}: чем заменить?
              </div>
              <Select
                style={{ width: '100%' }}
                placeholder="Выберите замену"
                value={replaceWith}
                onChange={(v) => setReplaceWith(v)}
                showSearch
                optionFilterProp="label"
                options={[
                  ...(supportsNull
                    ? [
                        {
                          value: NULL_VALUE,
                          label: isM2M
                            ? '— Удалить связи без замены —'
                            : '— Очистить (без значения) —',
                        },
                      ]
                    : []),
                  ...otherItems.map((x) => ({ value: x.id, label: x.name })),
                ]}
              />
            </div>
          )}

          {error && (
            <Alert type="error" message={error} style={{ marginTop: 12 }} showIcon />
          )}
        </>
      )}
    </Modal>
  );
}
