import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import type { OutletCode, FrameType, Category } from '../types';

export const OUTLETS: { code: OutletCode; name: string; id: string }[] = [
  { code: 'PLT', name: 'PLT HQ', id: 'plt' },
  { code: 'SS2', name: 'SS2 Outlet', id: 'ss2' },
  { code: 'KD', name: 'Kota Damansara', id: 'kd' },
  { code: 'CHR', name: 'Cheras Outlet', id: 'chr' },
];

export const FRAME_TYPES: FrameType[] = ['Sports', 'Titanium', 'Lightweight', 'Clip On', 'Plastic'];
export const CATEGORIES: Category[] = ['Frame', 'Sunglass'];
export const COMPLAINT_TYPES = [
  'Color Faded', 'Hinge Broken', 'Frame Cracked', 'Lens Issue',
  'Coating Peeled', 'Nose Pad Issue', 'Temple Broken', 'Other',
];

export const OUTLET_COLORS: Record<OutletCode, string> = {
  PLT: 'bg-purple-100 text-purple-800',
  SS2: 'bg-blue-100 text-blue-800',
  KD: 'bg-green-100 text-green-800',
  CHR: 'bg-orange-100 text-orange-800',
};

export const OUTLET_BORDER_COLORS: Record<OutletCode, string> = {
  PLT: 'border-purple-500',
  SS2: 'border-blue-500',
  KD: 'border-green-500',
  CHR: 'border-orange-500',
};

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_confirmation: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  open: 'bg-red-100 text-red-800',
  reviewed: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  partial: 'bg-orange-100 text-orange-800',
};

export function formatCurrency(value: number) {
  return `RM ${value.toFixed(2)}`;
}

export function formatDate(dateStr: string) {
  return format(new Date(dateStr), 'dd MMM yyyy');
}

export function formatDateTime(dateStr: string) {
  return format(new Date(dateStr), 'dd MMM yyyy HH:mm');
}

export function getMonthRange(date: Date) {
  return {
    start: format(startOfMonth(date), 'yyyy-MM-dd'),
    end: format(endOfMonth(date), 'yyyy-MM-dd'),
  };
}

export function getYearRange(year: number) {
  const d = new Date(year, 0, 1);
  return {
    start: format(startOfYear(d), 'yyyy-MM-dd'),
    end: format(endOfYear(d), 'yyyy-MM-dd'),
  };
}

export function generateInvoiceNumber() {
  const now = new Date();
  const yy = format(now, 'yy');
  const mm = format(now, 'MM');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TT-${yy}${mm}-${rand}`;
}

export function generateRefNumber(prefix: string) {
  const now = new Date();
  const ts = format(now, 'yyMMddHHmm');
  const rand = Math.floor(Math.random() * 900) + 100;
  return `${prefix}-${ts}-${rand}`;
}

export function getOutletName(code: OutletCode) {
  return OUTLETS.find((o) => o.code === code)?.name ?? code;
}
