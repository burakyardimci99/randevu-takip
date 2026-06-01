/**
 * DataTable — sortable, sticky-header, row-action destekli admin tablosu.
 *
 * Tasarım: 21st.dev "Modern Data Table" referansı + Kuveyt Türk paleti.
 * Sade ama özellikli — admin list ekranlarında card listesi yerine kullanılır.
 *
 * Kullanım:
 *   <DataTable
 *     rows={users}
 *     columns={[
 *       { key: 'name', label: 'Ad Soyad', sortable: true, cell: (u) => u.fullName },
 *       { key: 'email', label: 'E-posta' },
 *       { key: 'status', label: 'Durum', cell: (u) => <StatusBadge ... /> },
 *     ]}
 *     onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
 *     rowKey={(u) => u.id}
 *   />
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface DataTableColumn<T> {
  /** Sort/track için unique key. */
  key: string;
  /** Header text. */
  label: string;
  /** Cell render — default JSON.stringify(row[key]). */
  cell?: (row: T) => ReactNode;
  /** Sort destekli mi? sortable=true ise header'a tıklayınca sort uygular. */
  sortable?: boolean;
  /** Default sort accessor (row → primitive). Verilmezse cell'in row[key]'ini kullanır. */
  sortAccessor?: (row: T) => string | number | boolean | null | undefined;
  /** Cell hizalama. */
  align?: 'left' | 'center' | 'right';
  /** Sabit genişlik (Tailwind class — örn: "w-24" veya "w-[120px]"). */
  width?: string;
  /** Header sticky scroll'da kalsın. */
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  /** Satıra tıklandığında çağırılır (modal aç, route'a git vb.). */
  onRowClick?: (row: T) => void;
  /** Sticky header (varsayılan true). max-h ile birlikte kullan. */
  stickyHeader?: boolean;
  /** Compact mod — daha az padding. */
  compact?: boolean;
  /** Default sort key + direction. */
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  /** Boş tabloda gösterilecek React node (EmptyState önerilir). */
  emptyState?: ReactNode;
  /** En dış container'a class ekle (örn: max-h, height). */
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  stickyHeader = true,
  compact = false,
  defaultSort,
  emptyState,
  className = '',
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    defaultSort ?? null
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const accessor =
      col.sortAccessor ??
      ((r: T) => {
        const node = col.cell?.(r);
        return typeof node === 'string' || typeof node === 'number' ? node : '';
      });
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = accessor(a) ?? '';
      const bv = accessor(b) ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'tr') * dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null; // 3rd click clears sort
    });
  }

  const padCell = compact ? 'px-3 py-2' : 'px-4 py-3';
  const padHead = compact ? 'px-3 py-2' : 'px-4 py-2.5';

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      className={`overflow-x-auto rounded-2xl border border-kt-gray-100 bg-white ${className}`}
    >
      <table className="min-w-full text-sm">
        <thead
          className={`${
            stickyHeader ? 'sticky top-0 z-10' : ''
          } bg-kt-gray-50/80 backdrop-blur-sm border-b border-kt-gray-100`}
        >
          <tr>
            {columns.map((col) => {
              const isSorted = sort?.key === col.key;
              const ChevIcon = !isSorted
                ? ChevronsUpDown
                : sort?.direction === 'asc'
                  ? ChevronUp
                  : ChevronDown;
              const align =
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
              return (
                <th
                  key={col.key}
                  className={`${padHead} ${align} text-[11px] font-bold uppercase tracking-wider text-kt-gray-500 ${col.width ?? ''} ${col.className ?? ''}`}
                  scope="col"
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 font-bold transition ${
                        isSorted ? 'text-kt-green-900' : 'text-kt-gray-500 hover:text-kt-green-800'
                      }`}
                    >
                      {col.label}
                      <ChevIcon
                        size={12}
                        className={isSorted ? 'text-kt-gold-600' : 'text-kt-gray-400'}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-kt-gray-100">
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`${
                onRowClick ? 'cursor-pointer hover:bg-kt-gold-50/40' : ''
              } transition-colors`}
            >
              {columns.map((col) => {
                const align =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                return (
                  <td
                    key={col.key}
                    className={`${padCell} ${align} text-kt-green-900 ${col.width ?? ''}`}
                  >
                    {col.cell ? col.cell(row) : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
