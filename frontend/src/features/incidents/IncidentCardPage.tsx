import { useEffect, useState } from 'react';
import {
  Card,
  Tag,
  Space,
  Button,
  Descriptions,
  Tabs,
  List,
  Input,
  message,
  Upload,
  Modal,
  Typography,
  Tooltip,
} from 'antd';
import {
  UploadOutlined,
  EditOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '@/api/client';
import { Incident, IncidentStatus } from '@/api/types';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  availableTransitions,
  severityColor,
} from '@/shared/statusUtils';
import { useAuth } from '@/shared/auth';
import { IncidentEditModal } from './IncidentEditModal';

function InteractiveStepper({
  currentStatus,
  canTransition,
  onTransition,
}: {
  currentStatus: IncidentStatus;
  canTransition: boolean;
  onTransition: (target: IncidentStatus, requiresReason: boolean, label: string) => void;
}) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  const transitions = availableTransitions(currentStatus);

  const tryClick = (target: IncidentStatus) => {
    if (!canTransition) return;
    const opt = transitions.find((t) => t.target === target);
    if (!opt) return;
    onTransition(opt.target, opt.requiresReason, opt.label);
  };

  // Можно ли перейти на соседний этап в каждую сторону
  const nextStatus = STATUS_ORDER[currentIdx + 1];
  const prevStatus = STATUS_ORDER[currentIdx - 1];
  const canAdvance =
    canTransition && nextStatus && transitions.some((t) => t.target === nextStatus);
  const canRevert =
    canTransition && prevStatus && transitions.some((t) => t.target === prevStatus);
  const advanceOpt = transitions.find((t) => t.target === nextStatus);
  const revertOpt = transitions.find((t) => t.target === prevStatus);

  return (
    <div
      style={{
        padding: '28px 32px',
        marginBottom: 24,
        borderRadius: 12,
        background: 'linear-gradient(90deg, #f0f5ff 0%, #f6ffed 100%)',
        border: '1px solid #d6e4ff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {STATUS_ORDER.map((s, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const canClick = canTransition && transitions.some((t) => t.target === s);

          const circleColor = isCurrent
            ? '#1677ff'
            : isDone
            ? '#52c41a'
            : canClick
            ? '#faad14'
            : '#d9d9d9';
          const textColor = isCurrent
            ? '#1677ff'
            : isDone
            ? '#52c41a'
            : canClick
            ? '#fa8c16'
            : '#8c8c8c';

          return (
            <div
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: idx < STATUS_ORDER.length - 1 ? 1 : 'unset',
              }}
            >
              {/* Стрелка влево от current — для возврата на предыдущий */}
              {isCurrent && canRevert && revertOpt && (
                <Tooltip title={revertOpt.label}>
                  <Button
                    type="text"
                    shape="circle"
                    icon={<ArrowLeftOutlined style={{ fontSize: 20, color: '#fa8c16' }} />}
                    onClick={() => tryClick(prevStatus)}
                  />
                </Tooltip>
              )}

              <Tooltip title={canClick ? 'Перейти к этому этапу' : ''}>
                <div
                  onClick={() => canClick && tryClick(s)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    cursor: canClick ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      width: isCurrent ? 40 : 32,
                      height: isCurrent ? 40 : 32,
                      borderRadius: '50%',
                      background: circleColor,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: isCurrent ? 16 : 14,
                      boxShadow: isCurrent ? '0 0 0 4px rgba(22,119,255,0.2)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {idx + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: isCurrent ? 700 : 500,
                      color: textColor,
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </span>
                </div>
              </Tooltip>

              {/* Стрелка вправо от current — для продвижения вперёд */}
              {isCurrent && canAdvance && advanceOpt && (
                <Tooltip title={advanceOpt.label}>
                  <Button
                    type="text"
                    shape="circle"
                    icon={<ArrowRightOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                    onClick={() => tryClick(nextStatus)}
                  />
                </Tooltip>
              )}

              {/* Соединительная линия */}
              {idx < STATUS_ORDER.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: idx < currentIdx ? '#52c41a' : '#e0e0e0',
                    margin: '0 8px',
                    marginBottom: 28,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IncidentCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reasonModal, setReasonModal] = useState<{
    target: IncidentStatus;
    label: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const load = () => api.get<Incident>(`/incidents/${id}`).then((r) => setIncident(r.data));

  useEffect(() => {
    load();
  }, [id]);

  if (!incident) return <Card loading />;

  const doTransition = async (target: IncidentStatus, reason?: string) => {
    try {
      await api.post(`/incidents/${id}/transitions`, { target_status: target, reason });
      message.success(`Статус изменён на «${STATUS_LABEL[target]}»`);
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? 'Не удалось');
    }
  };

  const transitions = availableTransitions(incident.status);
  const canTransition =
    user?.role === 'supervisor' ||
    user?.role === 'administrator' ||
    (user?.role === 'manager' && incident.initiator?.id === user.id);
  const canEditOrComment = !!user;
  const canEdit =
    !!user &&
    (user.role === 'administrator' || incident.initiator?.id === user.id) &&
    incident.status !== 'closed' &&
    incident.status !== 'cancelled';

  const submitComment = async () => {
    if (!commentText.trim()) return;
    await api.post(`/incidents/${id}/comments`, { text: commentText });
    setCommentText('');
    load();
  };

  return (
    <>
      <Card>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Button onClick={() => navigate('/incidents')}>← Назад</Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Инцидент #{incident.id}
            </Typography.Title>
            <Tag color={STATUS_COLOR[incident.status]}>{STATUS_LABEL[incident.status]}</Tag>
            {incident.severity && (
              <Tag color={severityColor((incident.severity as any).code)}>
                {incident.severity.name}
              </Tag>
            )}
          </Space>
          <Space>
            {canEdit && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Изменить
              </Button>
            )}
            {canTransition &&
              transitions.map((t) => (
                <Button
                  key={t.target}
                  type={t.target === 'cancelled' ? 'default' : 'primary'}
                  danger={t.target === 'cancelled'}
                  onClick={() => {
                    if (t.requiresReason) {
                      setReasonText('');
                      setReasonModal({ target: t.target, label: t.label });
                    } else {
                      doTransition(t.target);
                    }
                  }}
                >
                  {t.label}
                </Button>
              ))}
          </Space>
        </Space>

        {incident.status === 'cancelled' ? (
          <div
            style={{
              padding: 20,
              marginBottom: 24,
              borderRadius: 8,
              background: 'linear-gradient(90deg, #fff1f0 0%, #fff7e6 100%)',
              border: '1px solid #ffccc7',
              textAlign: 'center',
            }}
          >
            <Tag color="default" style={{ fontSize: 16, padding: '4px 16px' }}>
              Инцидент отменён
            </Tag>
          </div>
        ) : (
          <InteractiveStepper
            currentStatus={incident.status}
            canTransition={canTransition}
            onTransition={(target, requiresReason, label) => {
              if (requiresReason) {
                setReasonText('');
                setReasonModal({ target, label });
              } else {
                doTransition(target);
              }
            }}
          />
        )}

        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Описание">{incident.description}</Descriptions.Item>
          <Descriptions.Item label="Тяжесть">
            {incident.severity ? (
              <Tag color={severityColor((incident.severity as any).code)}>
                {incident.severity.name}
              </Tag>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Категория">
            {incident.category?.name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Источник">
            {incident.source?.name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Этап воронки">
            {incident.funnel_stage.name}
          </Descriptions.Item>
          <Descriptions.Item label="Подразделение">{incident.department.name}</Descriptions.Item>
          <Descriptions.Item label="Инициатор">
            {incident.is_anonymous && user?.role === 'manager' && incident.initiator?.id !== user.id
              ? 'Анонимно'
              : incident.initiator?.full_name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Зарегистрирован">
            {dayjs(incident.registered_at).format('DD.MM.YYYY HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Случилось">
            {dayjs(incident.occured_at).format('DD.MM.YYYY HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Последствия">
            {incident.consequences.length > 0
              ? incident.consequences.map((c) => <Tag key={c.id}>{c.name}</Tag>)
              : '—'}
          </Descriptions.Item>
          {incident.cancellation_reason && (
            <Descriptions.Item label="Причина отмены">
              {incident.cancellation_reason}
            </Descriptions.Item>
          )}
          {incident.reopening_reason && (
            <Descriptions.Item label="Причина переоткрытия">
              {incident.reopening_reason}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Tabs
          style={{ marginTop: 24 }}
          items={[
            {
              key: 'history',
              label: 'История статусов',
              children: (
                <List
                  size="small"
                  dataSource={incident.status_history}
                  renderItem={(h) => (
                    <List.Item>
                      <Space>
                        <Tag color={STATUS_COLOR[h.new_status]}>
                          {STATUS_LABEL[h.new_status]}
                        </Tag>
                        {h.previous_status && (
                          <span style={{ color: '#888' }}>
                            ← {STATUS_LABEL[h.previous_status]}
                          </span>
                        )}
                        <span>{h.initiator.full_name}</span>
                        <span style={{ color: '#888' }}>
                          {dayjs(h.changed_at).format('DD.MM.YYYY HH:mm')}
                        </span>
                        {h.transition_reason && (
                          <span style={{ fontStyle: 'italic' }}>«{h.transition_reason}»</span>
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'comments',
              label: `Комментарии (${incident.comments.length})`,
              children: (
                <>
                  <List
                    dataSource={incident.comments}
                    renderItem={(c) => (
                      <List.Item style={{ display: 'block', padding: '12px 0' }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {c.author.full_name}
                        </div>
                        <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
                          {dayjs(c.created_at).format('DD.MM.YYYY HH:mm')}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div>
                      </List.Item>
                    )}
                  />
                  {canEditOrComment && (
                    <Space.Compact style={{ width: '100%', marginTop: 12 }}>
                      <Input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Добавить комментарий"
                        onPressEnter={submitComment}
                      />
                      <Button type="primary" onClick={submitComment}>
                        Отправить
                      </Button>
                    </Space.Compact>
                  )}
                </>
              ),
            },
            {
              key: 'attachments',
              label: `Вложения (${incident.attachments.length})`,
              children: (
                <>
                  <List
                    dataSource={incident.attachments}
                    renderItem={(a) => (
                      <List.Item
                        actions={[
                          <a
                            key="dl"
                            href={`${import.meta.env.VITE_API_URL}/attachments/${a.id}`}
                            target="_blank"
                          >
                            Скачать
                          </a>,
                        ]}
                      >
                        <List.Item.Meta
                          title={a.file_name}
                          description={`${(a.file_size / 1024).toFixed(1)} КБ — ${a.uploader.full_name} — ${dayjs(a.uploaded_at).format('DD.MM.YYYY')}`}
                        />
                      </List.Item>
                    )}
                  />
                  {canEditOrComment && incident.attachments.length < 5 && (
                    <Upload
                      customRequest={async ({ file, onSuccess, onError }) => {
                        const fd = new FormData();
                        fd.append('file', file as Blob);
                        try {
                          await api.post(`/incidents/${id}/attachments`, fd);
                          load();
                          onSuccess?.({});
                        } catch (e: any) {
                          message.error(e.response?.data?.detail ?? 'Ошибка загрузки');
                          onError?.(e);
                        }
                      }}
                      showUploadList={false}
                    >
                      <Button icon={<UploadOutlined />} style={{ marginTop: 12 }}>
                        Добавить файл (≤3 МБ, ≤5 файлов)
                      </Button>
                    </Upload>
                  )}
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!reasonModal}
        title={reasonModal?.label ?? ''}
        onOk={() => {
          if (!reasonModal) return;
          if (!reasonText.trim()) {
            message.error('Укажите причину');
            return;
          }
          doTransition(reasonModal.target, reasonText);
          setReasonModal(null);
        }}
        onCancel={() => setReasonModal(null)}
      >
        <Input.TextArea
          rows={4}
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder="Укажите причину"
          autoFocus
        />
      </Modal>

      <IncidentEditModal
        open={editOpen}
        incident={incident}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
    </>
  );
}
