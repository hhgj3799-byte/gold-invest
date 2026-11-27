import type { ActivityLogRecord } from '../types/platform';

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

/**
 * Escapes a single cell according to RFC 4180 and neutralizes spreadsheet
 * formula injection by prefixing leading formula characters with an apostrophe.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (FORMULA_TRIGGER_RE.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatActivityLogsCsv(logs: ActivityLogRecord[]): string {
  const headers = [
    'Log ID',
    'Timestamp (UTC)',
    'Category',
    'User Email',
    'User Name',
    'User ID',
    'Action',
    'Details',
    'Amount (USD)',
    'Status',
    'IP Address',
  ];

  const rows = logs.map((log) =>
    [
      log.id,
      log.createdAt,
      log.category,
      log.userEmail,
      log.userName,
      log.userId ?? '',
      log.actionTitle,
      log.details,
      log.amountUsd !== null && Number.isFinite(log.amountUsd) ? log.amountUsd.toFixed(2) : '',
      log.status,
      log.ipAddress,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}
