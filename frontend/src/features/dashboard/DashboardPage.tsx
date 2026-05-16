// Замена для frontend/src/features/dashboard/DashboardPage.tsx
//
// Что использует:
//   • DashboardData из @/api/types — уже есть.
//   • Никаких новых npm-зависимостей. @ant-design/charts больше не нужен — можно убрать.
//
// Что переиспользует из существующего:
//   • AppLayout (сайдбар + хедер). DashboardPage рендерится в <Content>.
//   • AntD только для табов и пикера дат.
//
// Что *не* реализовано на бэке (фичи дизайна — нужен бэк-доп):
//   • SLA-нарушения по этапам        → требуется endpoint /analytics/sla-breaches
//   • Тяжесть × этап с разрезом  → есть severity_by_stage_heatmap — используется
//   • Per-department KPI            → пока показываем top_departments + общие KPI
//   • Sparklines для KPI             → нужен ряд по дням для каждой метрики; пока без них
//   • Hot incidents                  → отдельный fetch /incidents?severity=critical&status=...
//
// Эти разделы помечены «// TODO backend» и спрятаны/показывают пустое состояние.

import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, DatePicker, Spin, Select } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/api/client';
import type { CatalogItem, DashboardData, IncidentStatus } from '@/api/types';
import {
  KpiCard, KpiSpec,
  Donut, HBar, StackedBar, LineChart, Heatmap, SalesFunnel,
  palette,
} from './dashboard-primitives';
import './dashboard.css';

const { RangePicker } = DatePicker;

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// ─────────────────────────────────────────────────────────────
function Card({ title, sub, tools, children }: {
  title?: string; sub?: string; tools?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="d-card">
      {(title || tools) && (
        <div className="d-card-h">
          <div>
            {title && <h3 className="d-card-title">{title}</h3>}
            {sub && <div className="d-card-sub">{sub}</div>}
          </div>
          {tools && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{tools}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export function DashboardPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [period, setPeriod] = useState<string>('30');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [departments, setDepartments] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [severities, setSeverities] = useState<CatalogItem[]>([]);
  const [sources, setSources] = useState<CatalogItem[]>([]);
  const [funnelStages, setFunnelStages] = useState<CatalogItem[]>([]);
  const [consequencesList, setConsequencesList] = useState<CatalogItem[]>([]);

  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [severityId, setSeverityId] = useState<number | undefined>(undefined);
  const [sourceId, setSourceId] = useState<number | undefined>(undefined);
  const [funnelStageId, setFunnelStageId] = useState<number | undefined>(undefined);
  const [consequenceId, setConsequenceId] = useState<number | undefined>(undefined);

  const hasFilters =
    !!departmentId ||
    !!categoryId ||
    !!severityId ||
    !!sourceId ||
    !!funnelStageId ||
    !!consequenceId;

  const resetFilters = () => {
    setDepartmentId(undefined);
    setCategoryId(undefined);
    setSeverityId(undefined);
    setSourceId(undefined);
    setFunnelStageId(undefined);
    setConsequenceId(undefined);
  };

  useEffect(() => {
    const opts = { params: { only_active: true } };
    Promise.all([
      api.get<CatalogItem[]>('/catalogs/departments', opts),
      api.get<CatalogItem[]>('/catalogs/categories', opts),
      api.get<CatalogItem[]>('/catalogs/severities', opts),
      api.get<CatalogItem[]>('/catalogs/sources', opts),
      api.get<CatalogItem[]>('/catalogs/funnel_stages', opts),
      api.get<CatalogItem[]>('/catalogs/consequences', opts),
    ]).then(([d, c, s, src, f, cq]) => {
      setDepartments(d.data);
      setCategories(c.data);
      setSeverities(s.data);
      setSources(src.data);
      setFunnelStages(f.data);
      setConsequencesList(cq.data);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, unknown> = {
      period_from: range[0].toISOString(),
      period_to: range[1].toISOString(),
    };
    if (departmentId) params.department_id = departmentId;
    if (categoryId) params.category_id = categoryId;
    if (severityId) params.severity_id = severityId;
    if (sourceId) params.source_id = sourceId;
    if (funnelStageId) params.funnel_stage_id = funnelStageId;
    if (consequenceId) params.consequence_id = consequenceId;
    api
      .get<DashboardData>('/analytics/dashboard', { params })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [range, departmentId, categoryId, severityId, sourceId, funnelStageId, consequenceId]);

  const handlePeriodChip = (id: string) => {
    setPeriod(id);
    const map: Record<string, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };
    if (map[id]) setRange([dayjs().subtract(map[id], 'day'), dayjs()]);
  };

  return (
    <div className="dash" style={{ position: 'relative' }}>
      <div className="dash-page-head">
        <div>
          <h1 className="dash-page-title">Аналитический дашборд</h1>
          <div className="dash-page-sub">Учёт операционных инцидентов в отделах продаж</div>
        </div>
        <div className="dash-page-sub">
          Период · <strong style={{ color: 'var(--d-text)' }}>
            {range[0].format('DD MMM YYYY')} — {range[1].format('DD MMM YYYY')}
          </strong>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filterbar">
        <div className="chip-group">
          {[['7', '7 дней'], ['30', '30 дней'], ['90', 'Квартал'], ['365', 'Год']].map(([id, lbl]) => (
            <button key={id} className="chip" aria-pressed={period === id} onClick={() => handlePeriodChip(id)}>
              {lbl}
            </button>
          ))}
        </div>
        <RangePicker
          value={range}
          onChange={(v) => {
            if (v && v[0] && v[1]) { setRange([v[0], v[1]]); setPeriod('custom'); }
          }}
        />
        <div style={{ flex: 1 }} />
        {loading && <Spin size="small" />}
      </div>

      {/* Фильтры по справочникам */}
      <div className="filterbar" style={{ marginTop: -8 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все отделы"
          style={{ minWidth: 180, flex: '1 1 180px' }}
          value={departmentId}
          onChange={(v) => setDepartmentId(v)}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все категории"
          style={{ minWidth: 180, flex: '1 1 180px' }}
          value={categoryId}
          onChange={(v) => setCategoryId(v)}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          allowClear
          placeholder="Любая тяжесть"
          style={{ minWidth: 140, flex: '1 1 140px' }}
          value={severityId}
          onChange={(v) => setSeverityId(v)}
          options={severities.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          allowClear
          placeholder="Любой источник"
          style={{ minWidth: 160, flex: '1 1 160px' }}
          value={sourceId}
          onChange={(v) => setSourceId(v)}
          options={sources.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Любой этап"
          style={{ minWidth: 180, flex: '1 1 180px' }}
          value={funnelStageId}
          onChange={(v) => setFunnelStageId(v)}
          options={funnelStages.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          allowClear
          placeholder="Любые последствия"
          style={{ minWidth: 170, flex: '1 1 170px' }}
          value={consequenceId}
          onChange={(v) => setConsequenceId(v)}
          options={consequencesList.map((s) => ({ value: s.id, label: s.name }))}
        />
        {hasFilters && (
          <button className="chip" onClick={resetFilters} title="Сбросить фильтры">
            Сбросить
          </button>
        )}
      </div>

      {!data ? (
        <div style={{ padding: 80, textAlign: 'center' }}>
          <Spin tip="Загрузка дашборда" />
        </div>
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'overview',      label: 'Обзор',           children: <OverviewTab data={data} /> },
              { key: 'funnel',        label: 'Воронка продаж',  children: <FunnelTab data={data} /> },
              { key: 'distributions', label: 'Структура',        children: <DistributionsTab data={data} /> },
              { key: 'patterns',      label: 'Паттерны',         children: <PatternsTab data={data} /> },
              { key: 'departments',   label: 'Отделы',           children: <DepartmentsTab data={data} /> },
            ]}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// ОБЗОР
// ============================================================
function OverviewTab({ data }: { data: DashboardData }) {
  const c = data.kpis.current;
  const p = data.kpis.previous;

  const kpis: { spec: KpiSpec; color: string }[] = [
    { spec: { label: 'Всего инцидентов', current: c.total_incidents, previous: p.total_incidents, hint: 'Зарегистрировано за период' },                        color: palette.accent },
    { spec: { label: 'MTTR',             current: c.mttr_hours,      previous: p.mttr_hours,      unit: ' ч', reverse: true, hint: 'Среднее время до закрытия' }, color: palette.min },
    { spec: { label: 'Коэф. закрытия',   current: c.closure_coefficient, previous: p.closure_coefficient, unit: '%', hint: 'Доля закрытых от зарегистрированных' }, color: palette.good },
    { spec: { label: 'Частота повторов', current: c.recurrence_frequency, previous: p.recurrence_frequency, unit: '%', reverse: true, hint: 'Категории с ≥2 случаями' }, color: palette.sig },
    { spec: { label: 'Доля Critical',    current: c.critical_share, previous: p.critical_share, unit: '%', reverse: true, hint: 'Доля критичных инцидентов' },     color: palette.crit },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="d-grid-5">
        {kpis.map(({ spec, color }) => <KpiCard key={spec.label} k={spec} sparkColor={color} />)}
      </div>

      <div className="d-grid-12">
        <div className="d-col-7">
          <Card
            title="Воронка продаж × инциденты"
            sub="Объём инцидентов на каждом этапе и доли по этапам"
          >
            <SalesFunnel stages={data.funnel.map((f, i) => ({ name: f.name, count: f.count, order: i + 1 }))} />
          </Card>
        </div>
        <div className="d-col-5" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Доля по тяжести" sub="Распределение всех инцидентов периода">
            <SeverityStack data={data} />
          </Card>
          <Card title="По статусам жизненного цикла" sub="Текущее состояние всех инцидентов периода">
            <StatusDonut data={data} />
          </Card>
        </div>
      </div>

      <Card
        title="Динамика регистрации и закрытия"
        sub="Дневная регистрация и количество закрытых инцидентов"
      >
        <LineChart
          xKey="d"
          data={data.trend.map((t) => ({
            d: t.date ? dayjs(t.date).format('DD.MM') : '',
            reg: t.registered,
            closed: t.closed,
            crit: t.critical,
          }))}
          series={[
            { key: 'reg', label: 'Зарегистрировано', color: palette.accent, fill: true },
            { key: 'closed', label: 'Закрыто', color: palette.good },
            { key: 'crit', label: 'Критичные', color: palette.crit },
          ]}
        />
      </Card>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  registered: 'Зарегистрирован',
  under_review: 'На разборе',
  processed: 'Обработан',
  closed: 'Закрыт',
  cancelled: 'Отменён',
};

const STATUS_COLOR: Record<string, string> = {
  registered: 'var(--d-c1)',
  under_review: 'var(--d-significant)',
  processed: 'var(--d-c6)',
  closed: 'var(--d-good)',
  cancelled: 'var(--d-text-subtle)',
};

const STATUS_ORDER: IncidentStatus[] = ['registered', 'under_review', 'processed', 'closed', 'cancelled'];

function StatusDonut({ data }: { data: DashboardData }) {
  const statuses = data.distributions.statuses ?? [];
  const byStatus = new Map(statuses.map((s) => [s.status, s.count]));
  const items = STATUS_ORDER
    .map((s) => ({
      name: STATUS_LABEL[s] ?? s,
      code: s,
      count: byStatus.get(s) ?? 0,
    }))
    .filter((x) => x.count > 0);
  const total = items.reduce((s, x) => s + x.count, 0);

  if (total === 0) {
    return <div style={{ color: 'var(--d-text-subtle)', padding: 20, textAlign: 'center' }}>Нет данных</div>;
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Donut
        items={items}
        colorOf={(it) => STATUS_COLOR[it.code as string] ?? 'var(--d-text-subtle)'}
        centerLabel={total}
        centerSub="инцидентов"
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((s) => (
          <div
            key={s.code}
            style={{
              display: 'grid',
              gridTemplateColumns: '10px 1fr auto auto',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <span className="d-legend-swatch" style={{ background: STATUS_COLOR[s.code] }} />
            <span style={{ fontSize: 12 }}>{s.name}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12 }}>
              {s.count}
            </span>
            <span
              style={{
                color: 'var(--d-text-subtle)',
                fontSize: 11,
                width: 40,
                textAlign: 'right',
              }}
            >
              {total ? ((s.count / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeverityStack({ data }: { data: DashboardData }) {
  // Бэк-формат: distributions.severities = [{id, name, count}]
  // У нас нет severity_code на этом уровне — определяем по имени.
  const sev = data.distributions.severities;
  const crit = sev.find((s) => s.name.toLowerCase().includes('крит'))?.count ?? 0;
  const min = sev.find((s) => s.name.toLowerCase().includes('незнач'))?.count ?? 0;
  const sig =
    sev.find((s) => {
      const n = s.name.toLowerCase();
      return n.includes('знач') && !n.includes('незнач');
    })?.count ?? 0;
  const total = crit + sig + min;
  return (
    <>
      <StackedBar
        height={18}
        total={total}
        segments={[
          { label: 'Критичный',      value: crit, color: 'var(--d-critical)' },
          { label: 'Значительный',   value: sig,  color: 'var(--d-significant)' },
          { label: 'Незначительный', value: min,  color: 'var(--d-minor)' },
        ]}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 6 }}>
        {[
          { label: 'Критичный',      value: crit, color: 'var(--d-critical)' },
          { label: 'Значительный',   value: sig,  color: 'var(--d-significant)' },
          { label: 'Незначительный', value: min,  color: 'var(--d-minor)' },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 10, color: 'var(--d-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--d-text-subtle)' }}>
                {total ? ((s.value / total) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================
// ВОРОНКА
// ============================================================
function FunnelTab({ data }: { data: DashboardData }) {
  const stages = data.funnel.map((f, i) => ({ ...f, order: i + 1 }));
  const totalAll = useMemo(() => stages.reduce((s, x) => s + x.count, 0), [stages]);

  // Сортируем для рейтинга проблемных этапов
  const ranked = useMemo(
    () => [...stages].sort((a, b) => b.count - a.count),
    [stages],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="d-grid-12">
        <div className="d-col-7">
          <Card title="Воронка — инциденты по этапам" sub="Ширина пропорциональна объёму на этапе">
            <SalesFunnel stages={stages.map(s => ({ name: s.name, count: s.count, order: s.order }))} />
          </Card>
        </div>
        <div className="d-col-5">
          <Card title="Рейтинг проблемных этапов" sub="Этапы воронки по количеству инцидентов">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--d-text-subtle)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>Этап</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Инц.</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Доля</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t, i) => {
                  const share = totalAll ? (t.count / totalAll) * 100 : 0;
                  return (
                    <tr key={t.name} style={{ borderTop: '1px solid var(--d-border)' }}>
                      <td style={{ padding: '8px 4px' }}>
                        <span style={{ color: 'var(--d-text-subtle)', fontWeight: 600, marginRight: 6, fontVariantNumeric: 'tabular-nums' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 4px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {t.count}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--d-text-muted)' }}>
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <Card title="Тяжесть × этап воронки" sub="Где концентрируются проблемы">
        <FunnelHeatmap data={data} />
      </Card>
    </div>
  );
}

function FunnelHeatmap({ data }: { data: DashboardData }) {
  const rows = Array.from(new Set(data.severity_by_stage_heatmap.map(x => x.severity))).map(s => ({ label: s }));
  // Сохраняем порядок этапов как в funnel
  const stageOrder = data.funnel.map(f => f.name);
  const cols = stageOrder.map(s => ({ label: s }));
  if (!rows.length || !cols.length) return <div style={{ color: 'var(--d-text-subtle)' }}>Нет данных</div>;
  return (
    <Heatmap
      labelW={140}
      rows={rows}
      cols={cols}
      valueOf={(r, c) =>
        data.severity_by_stage_heatmap.find(x => x.severity === r.label && x.stage === c.label)?.count ?? 0
      }
      baseColor="25"
      showValues
      cellH={32}
    />
  );
}

// ============================================================
// СТРУКТУРА (бывшая «Распределения»)
// ============================================================
function DistributionsTab({ data }: { data: DashboardData }) {
  const d = data.distributions;
  const cbd = data.category_by_department ?? [];

  const totalSrc = d.sources.reduce((s, x) => s + x.count, 0);
  const totalCat = d.categories.reduce((s, x) => s + x.count, 0);
  const totalSev = d.severities.reduce((s, x) => s + x.count, 0);

  const topSource = d.sources.slice().sort((a, b) => b.count - a.count)[0];
  const critical = d.severities.find((x) => x.name.toLowerCase().includes('крит'));

  // Категории — отсортированные
  const orderedCats = d.categories.slice().sort((a, b) => b.count - a.count);

  // Кросс-таблица: уникальные категории (топ N) × уникальные отделы
  const deptSet = new Map<number, string>();
  cbd.forEach((r) => deptSet.set(r.department_id, r.department));
  const depts = Array.from(deptSet.entries()).map(([id, name]) => ({ id, name }));
  const cellValue = (catId: number, deptId: number) =>
    cbd.find((r) => r.category_id === catId && r.department_id === deptId)?.count ?? 0;
  const maxCell = Math.max(1, ...cbd.map((r) => r.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="d-grid-12">
        {/* Источники */}
        <div className="d-col-4">
          <Card title="Источники возникновения" sub="Что чаще всего вызывает инциденты">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Donut
                items={d.sources}
                colorOf={(_, i) => palette.c[i]}
                centerLabel={
                  topSource && totalSrc
                    ? `${((topSource.count / totalSrc) * 100).toFixed(1)}%`
                    : '0%'
                }
                centerSub={topSource?.name.toLowerCase() ?? ''}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.sources.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '10px 1fr auto auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <span className="d-legend-swatch" style={{ background: palette.c[i] }} />
                    <span style={{ fontSize: 12 }}>{s.name}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12 }}>
                      {s.count}
                    </span>
                    <span style={{ color: 'var(--d-text-subtle)', fontSize: 11, width: 40, textAlign: 'right' }}>
                      {totalSrc ? ((s.count / totalSrc) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Тяжесть */}
        <div className="d-col-4">
          <Card title="Тяжесть" sub="Распределение по уровням">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Donut
                items={d.severities}
                colorOf={(it) => {
                  const n = it.name.toLowerCase();
                  if (n.includes('крит')) return 'var(--d-critical)';
                  if (n.includes('незнач')) return 'var(--d-minor)';
                  if (n.includes('знач')) return 'var(--d-significant)';
                  return 'var(--d-minor)';
                }}
                centerLabel={critical?.count ?? 0}
                centerSub="критичных"
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.severities.map((s) => {
                  const n = s.name.toLowerCase();
                  const color = n.includes('крит')
                    ? 'var(--d-critical)'
                    : n.includes('незнач')
                    ? 'var(--d-minor)'
                    : n.includes('знач')
                    ? 'var(--d-significant)'
                    : 'var(--d-minor)';
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '10px 1fr auto auto',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span className="d-legend-swatch" style={{ background: color }} />
                      <span style={{ fontSize: 12 }}>{s.name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12 }}>
                        {s.count}
                      </span>
                      <span style={{ color: 'var(--d-text-subtle)', fontSize: 11, width: 40, textAlign: 'right' }}>
                        {totalSev ? ((s.count / totalSev) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Последствия */}
        <div className="d-col-4">
          <Card title="Последствия" sub="Один инцидент может иметь несколько видов">
            {d.consequences && d.consequences.length > 0 ? (
              <HBar
                labelWidth={160}
                items={d.consequences.map((c) => ({ label: c.name, value: c.count }))}
                colorOf={(_, i) => palette.c[i]}
              />
            ) : (
              <div style={{ color: 'var(--d-text-subtle)', textAlign: 'center', padding: 24 }}>
                Нет данных
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Категории — расширенный разбор */}
      <Card
        title="Категории — расширенный разбор"
        sub={`Всего категорий: ${d.categories.length} · охватили ${totalCat} инцидентов`}
      >
        <CategoriesUnified
          categories={orderedCats}
          departments={depts}
          cellValue={cellValue}
          maxCell={maxCell}
          totalCat={totalCat}
        />
      </Card>
    </div>
  );
}

function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return '';
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (strs[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

function stripCommonPrefix(names: string[]): string[] {
  if (names.length < 2) return names;
  const prefix = longestCommonPrefix(names);
  // Чистим хвост от пробелов, тире и пунктуации
  const cleaned = prefix.replace(/[\s\-–—:·,.;]+$/u, '');
  if (cleaned.length < 3) return names;
  return names.map((n) => {
    const tail = n.slice(cleaned.length).replace(/^[\s\-–—:·,.;]+/u, '');
    return tail || n;
  });
}

function CategoriesUnified({
  categories,
  departments,
  cellValue,
  maxCell,
  totalCat,
}: {
  categories: { id: number; name: string; count: number }[];
  departments: { id: number; name: string }[];
  cellValue: (catId: number, deptId: number) => number;
  maxCell: number;
  totalCat: number;
}) {
  const deptShort = stripCommonPrefix(departments.map((d) => d.name));
  const maxBar = Math.max(1, ...categories.map((c) => c.count));
  const ROW_H = 36; // строго одинаковая высота для всех строк
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const hasDepts = departments.length > 0;

  return (
    <div>
      {/* Заголовок секций */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasDepts
            ? `minmax(200px, 1.4fr) minmax(140px, 1.8fr) 100px 1px repeat(${departments.length}, minmax(0, 1fr))`
            : 'minmax(200px, 1.4fr) minmax(140px, 1.8fr) 100px',
          gap: 8,
          paddingBottom: 8,
          borderBottom: '1px solid var(--d-border)',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: 'var(--d-text-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}
        >
          Категория
        </div>
        <div />
        <div
          style={{
            fontSize: 10,
            color: 'var(--d-text-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
            textAlign: 'right',
          }}
        >
          Инциденты
        </div>
        {hasDepts && (
          <>
            <div style={{ background: 'var(--d-border)' }} />
            {departments.map((d, i) => (
              <div
                key={d.id}
                style={{
                  fontSize: 11,
                  color: 'var(--d-text-subtle)',
                  textAlign: 'center',
                  fontWeight: 600,
                  lineHeight: 1.25,
                  wordBreak: 'break-word',
                  alignSelf: 'end',
                }}
                title={d.name}
              >
                {deptShort[i]}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Строки данных */}
      {categories.map((c, i) => {
        const barPct = (c.count / maxBar) * 100;
        const sharePct = totalCat ? (c.count / totalCat) * 100 : 0;
        const color = palette.c[i % palette.c.length];
        const isHover = hoverRow === c.id;
        return (
          <div
            key={c.id}
            onMouseEnter={() => setHoverRow(c.id)}
            onMouseLeave={() => setHoverRow(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: hasDepts
                ? `minmax(200px, 1.4fr) minmax(140px, 1.8fr) 100px 1px repeat(${departments.length}, minmax(0, 1fr))`
                : 'minmax(200px, 1.4fr) minmax(140px, 1.8fr) 100px',
              gap: 8,
              alignItems: 'center',
              minHeight: ROW_H,
              padding: '4px 0',
              borderRadius: 6,
              background: isHover ? 'var(--d-bg-muted)' : 'transparent',
              transition: 'background 0.12s',
            }}
          >
            {/* Название категории */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--d-text)',
                lineHeight: 1.3,
                wordBreak: 'break-word',
                paddingLeft: 6,
              }}
              title={c.name}
            >
              {c.name}
            </div>
            {/* Бар */}
            <div
              style={{
                height: 18,
                borderRadius: 4,
                background: 'var(--d-bg-elev)',
                border: '1px solid var(--d-border)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${barPct}%`,
                  background: color,
                  borderRadius: 3,
                }}
              />
            </div>
            {/* Кол-во · % */}
            <div
              style={{
                textAlign: 'right',
                fontSize: 12.5,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                paddingRight: 4,
              }}
            >
              <span>{c.count}</span>
              <span style={{ color: 'var(--d-text-subtle)', fontWeight: 500 }}>
                {' · '}
                {sharePct.toFixed(1)}%
              </span>
            </div>
            {/* Вертикальный разделитель */}
            {hasDepts && <div style={{ background: 'var(--d-border)', alignSelf: 'stretch' }} />}
            {/* Ячейки отделов */}
            {hasDepts &&
              departments.map((d) => {
                const v = cellValue(c.id, d.id);
                const intensity = maxCell ? Math.max(0.12, v / maxCell) : 0;
                return (
                  <div
                    key={d.id}
                    style={{
                      minHeight: 28,
                      background:
                        v === 0
                          ? 'var(--d-bg-muted)'
                          : `oklch(0.78 ${0.06 + intensity * 0.1} 268 / ${0.2 + intensity * 0.7})`,
                      borderRadius: 4,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: intensity > 0.6 ? 'white' : 'var(--d-text)',
                    }}
                  >
                    {v || ''}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// ПАТТЕРНЫ
// ============================================================
function PatternsTab({ data }: { data: DashboardData }) {
  // activity_heatmap: { day: 0..6, hour: 0..23, count }
  const hoursPresent = Array.from(new Set(data.activity_heatmap.map(x => x.hour))).sort((a, b) => a - b);
  // Берём бизнес-часы из реальных данных или дефолт 8..20
  const hours = hoursPresent.length ? hoursPresent : Array.from({ length: 13 }, (_, i) => i + 8);
  // Дни в человеческом порядке Пн..Вс
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Когда возникают инциденты" sub="Тепловая карта дня недели × часа регистрации">
        <Heatmap
          labelW={42}
          rows={dayOrder.map(d => ({ label: DAY_NAMES[d], _idx: d }))}
          cols={hours.map(h => ({ label: `${String(h).padStart(2, '0')}:00`, _h: h }))}
          valueOf={(r: any, c: any) =>
            data.activity_heatmap.find(x => x.day === r._idx && x.hour === c._h)?.count ?? 0
          }
          baseColor="268"
          showValues
          cellH={30}
        />
      </Card>

      <Card title="Тяжесть × этап воронки" sub="Где концентрируются критичные">
        <FunnelHeatmap data={data} />
      </Card>
    </div>
  );
}

// ============================================================
// ОТДЕЛЫ
// ============================================================
function DepartmentsTab({ data }: { data: DashboardData }) {
  // Из бэка приходит только top_departments (count). Если нужны полные KPI по отделам,
  // нужно расширить /analytics/dashboard или сделать /analytics/by-department.
  const total = data.top_departments.reduce((s, d) => s + d.count, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="d-grid-12">
        {data.top_departments.map((d, i) => (
          <div className="d-col-4" key={d.id}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--d-text-subtle)' }}>Отдел продаж</div>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{d.name}</div>
                </div>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: palette.c[i % palette.c.length], color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>
                  {d.name.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--d-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Инциденты</div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{d.count}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--d-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Доля</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: palette.c[i % palette.c.length] }}>
                    {total ? ((d.count / total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
      <Card title="Распределение инцидентов по отделам" sub="Сводно за период">
        <HBar
          labelWidth={220}
          items={data.top_departments.map((d) => ({ label: d.name, value: d.count }))}
          colorOf={(_, i) => palette.c[i]}
          valueFmt={(it) => `${it.value}${total ? ` · ${((it.value / total) * 100).toFixed(1)}%` : ''}`}
        />
      </Card>
    </div>
  );
}
